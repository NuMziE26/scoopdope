import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Contract,
  Keypair,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
  xdr,
} from '@stellar/stellar-sdk';
import { GrantApplication, GrantStatus } from './entities/grant-application.entity';
import { CreateGrantApplicationDto } from './dto/create-grant-application.dto';
import { ReviewGrantApplicationDto } from './dto/review-grant-application.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class GrantsService {
  private readonly logger = new Logger(GrantsService.name);
  private readonly server: SorobanRpc.Server;
  private readonly contractId: string;
  private readonly networkPassphrase: string;

  constructor(
    @InjectRepository(GrantApplication)
    private readonly grantRepository: Repository<GrantApplication>,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {
    const rpcUrl = this.configService.get<string>('SOROBAN_RPC_URL', 'https://soroban-testnet.stellar.org');
    this.server = new SorobanRpc.Server(rpcUrl);
    this.contractId = this.configService.get<string>('GRANTS_CONTRACT_ID', '');
    this.networkPassphrase = this.configService.get<string>(
      'STELLAR_NETWORK_PASSPHRASE',
      Networks.TESTNET,
    );
  }

  async apply(dto: CreateGrantApplicationDto, applicantId: string): Promise<GrantApplication> {
    const application = this.grantRepository.create({
      applicantId,
      title: dto.title,
      description: dto.description,
      amountRequested: dto.amountRequested,
      status: GrantStatus.PENDING,
    });

    const saved = await this.grantRepository.save(application);

    try {
      const txHash = await this.submitApplicationToContract(saved);
      saved.contractTxHash = txHash;
      return await this.grantRepository.save(saved);
    } catch (error) {
      this.logger.error(`Failed to submit grant application ${saved.id} to contract`, error as Error);
      throw new BadRequestException('Failed to submit grant application to the grants contract');
    }
  }

  async review(
    id: string,
    dto: ReviewGrantApplicationDto,
    reviewer: { id: string; isAdmin: boolean },
  ): Promise<GrantApplication> {
    if (!reviewer.isAdmin) {
      throw new ForbiddenException('Only admins can approve or reject grant applications');
    }

    const application = await this.grantRepository.findOne({ where: { id } });
    if (!application) {
      throw new NotFoundException(`Grant application ${id} not found`);
    }
    if (application.status !== GrantStatus.PENDING) {
      throw new BadRequestException('Grant application has already been reviewed');
    }

    const approved = dto.decision === 'approve';
    if (!approved && !dto.reason) {
      throw new BadRequestException('A reason is required when rejecting a grant application');
    }

    application.status = approved ? GrantStatus.APPROVED : GrantStatus.REJECTED;
    application.reviewReason = dto.reason ?? null;
    application.reviewedBy = reviewer.id;
    application.reviewedAt = new Date();

    const saved = await this.grantRepository.save(application);

    try {
      const txHash = await this.submitDecisionToContract(saved, approved);
      saved.contractTxHash = txHash;
      await this.grantRepository.save(saved);
    } catch (error) {
      this.logger.error(`Failed to record decision for grant ${saved.id} on contract`, error as Error);
      throw new BadRequestException('Failed to record grant decision on the grants contract');
    }

    await this.notificationsService.create({
      userId: saved.applicantId,
      type: approved ? 'grant_approved' : 'grant_rejected',
      title: approved ? 'Grant application approved' : 'Grant application rejected',
      message: approved
        ? `Your grant application "${saved.title}" has been approved.`
        : `Your grant application "${saved.title}" was rejected. Reason: ${saved.reviewReason}`,
      metadata: { grantApplicationId: saved.id },
    });

    return saved;
  }

  async findMine(applicantId: string): Promise<GrantApplication[]> {
    return this.grantRepository.find({
      where: { applicantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOpen(): Promise<GrantApplication[]> {
    return this.grantRepository.find({
      where: { status: GrantStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
  }

  private async submitApplicationToContract(application: GrantApplication): Promise<string> {
    const contract = new Contract(this.contractId);
    const operation = contract.call(
      'apply',
      nativeToScVal(application.id, { type: 'string' }),
      nativeToScVal(application.applicantId, { type: 'string' }),
      nativeToScVal(application.amountRequested, { type: 'i128' }),
    );
    return this.invokeContract(operation);
  }

  private async submitDecisionToContract(application: GrantApplication, approved: boolean): Promise<string> {
    const contract = new Contract(this.contractId);
    const operation = contract.call(
      approved ? 'approve' : 'reject',
      nativeToScVal(application.id, { type: 'string' }),
      nativeToScVal(application.reviewReason ?? '', { type: 'string' }),
    );
    return this.invokeContract(operation);
  }

  private async invokeContract(operation: xdr.Operation): Promise<string> {
    const secret = this.configService.get<string>('GRANTS_SIGNER_SECRET', '');
    if (!secret) {
      throw new Error('GRANTS_SIGNER_SECRET is not configured');
    }
    const signer = Keypair.fromSecret(secret);
    const account = await this.server.getAccount(signer.publicKey());

    const transaction = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    const prepared = await this.server.prepareTransaction(transaction);
    prepared.sign(signer);

    const response = await this.server.sendTransaction(prepared);
    if (response.status === 'ERROR') {
      throw new Error(`Contract invocation failed: ${JSON.stringify(response.errorResult)}`);
    }
    return response.hash;
  }
}
