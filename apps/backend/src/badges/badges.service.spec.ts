import { Test, TestingModule } from '@nestjs/testing';
import { BadgesService } from './badges.service';
import { BadgesRepository } from './badges.repository';
import { StellarService } from '../stellar/stellar.service';

describe('BadgesService', () => {
  let service: BadgesService;
  let repository: {
    findUserBadge: jest.Mock;
    createUserBadge: jest.Mock;
    findBadgeByKey: jest.Mock;
    listUserBadges: jest.Mock;
  };
  let stellarService: {
    mintBadge: jest.Mock;
  };

  const learnerId = 'learner-1';

  const firstCompletionBadge = {
    id: 'badge-first-completion',
    key: 'first_completion',
    name: 'First Completion',
    description: 'Awarded for completing your first course.',
  };

  const streak7Badge = {
    id: 'badge-streak-7',
    key: 'streak_7',
    name: '7-Day Streak',
    description: 'Awarded for maintaining a 7-day learning streak.',
  };

  beforeEach(async () => {
    repository = {
      findUserBadge: jest.fn().mockResolvedValue(null),
      createUserBadge: jest.fn().mockImplementation(async (data) => ({
        id: 'user-badge-1',
        ...data,
      })),
      findBadgeByKey: jest.fn().mockImplementation(async (key: string) => {
        if (key === 'first_completion') return firstCompletionBadge;
        if (key === 'streak_7') return streak7Badge;
        return null;
      }),
      listUserBadges: jest.fn().mockResolvedValue([]),
    };

    stellarService = {
      mintBadge: jest.fn().mockResolvedValue({ txHash: 'tx-abc123' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BadgesService,
        { provide: BadgesRepository, useValue: repository },
        { provide: StellarService, useValue: stellarService },
      ],
    }).compile();

    service = module.get<BadgesService>(BadgesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('first course completion', () => {
    it('awards the first_completion badge', async () => {
      const result = await service.evaluateAndAward(learnerId, {
        type: 'course.completed',
        completedCourseCount: 1,
      });

      expect(repository.findBadgeByKey).toHaveBeenCalledWith('first_completion');
      expect(repository.findUserBadge).toHaveBeenCalledWith(
        learnerId,
        firstCompletionBadge.id,
      );
      expect(repository.createUserBadge).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: learnerId,
          badgeId: firstCompletionBadge.id,
        }),
      );
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: 'first_completion' }),
        ]),
      );
    });

    it('does not award first_completion when it is not the first completion', async () => {
      const result = await service.evaluateAndAward(learnerId, {
        type: 'course.completed',
        completedCourseCount: 2,
      });

      expect(repository.createUserBadge).not.toHaveBeenCalledWith(
        expect.objectContaining({ badgeId: firstCompletionBadge.id }),
      );
      expect(result).toEqual([]);
    });
  });

  describe('7-day streak', () => {
    it('awards the streak_7 badge when the streak reaches 7 days', async () => {
      const result = await service.evaluateAndAward(learnerId, {
        type: 'streak.updated',
        streakDays: 7,
      });

      expect(repository.findBadgeByKey).toHaveBeenCalledWith('streak_7');
      expect(repository.findUserBadge).toHaveBeenCalledWith(
        learnerId,
        streak7Badge.id,
      );
      expect(repository.createUserBadge).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: learnerId,
          badgeId: streak7Badge.id,
        }),
      );
      expect(result).toEqual(
        expect.arrayContaining([expect.objectContaining({ key: 'streak_7' })]),
      );
    });

    it('does not award streak_7 when the streak is below 7 days', async () => {
      const result = await service.evaluateAndAward(learnerId, {
        type: 'streak.updated',
        streakDays: 6,
      });

      expect(repository.createUserBadge).not.toHaveBeenCalledWith(
        expect.objectContaining({ badgeId: streak7Badge.id }),
      );
      expect(result).toEqual([]);
    });
  });

  describe('at-most-once awarding', () => {
    it('awards the same badge only once per learner', async () => {
      repository.findUserBadge
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'user-badge-1',
          userId: learnerId,
          badgeId: firstCompletionBadge.id,
        });

      const event = {
        type: 'course.completed' as const,
        completedCourseCount: 1,
      };

      const firstResult = await service.evaluateAndAward(learnerId, event);
      const secondResult = await service.evaluateAndAward(learnerId, event);

      expect(firstResult).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: 'first_completion' }),
        ]),
      );
      expect(secondResult).toEqual([]);

      const createCallsForBadge = repository.createUserBadge.mock.calls.filter(
        ([data]) => data.badgeId === firstCompletionBadge.id,
      );
      expect(createCallsForBadge).toHaveLength(1);
    });

    it('does not mint on-chain when the badge was already awarded', async () => {
      repository.findUserBadge.mockResolvedValue({
        id: 'user-badge-1',
        userId: learnerId,
        badgeId: firstCompletionBadge.id,
      });

      const result = await service.evaluateAndAward(learnerId, {
        type: 'course.completed',
        completedCourseCount: 1,
      });

      expect(result).toEqual([]);
      expect(stellarService.mintBadge).not.toHaveBeenCalled();
    });
  });

  describe('on-chain minting', () => {
    it('mints once per newly awarded badge', async () => {
      await service.evaluateAndAward(learnerId, {
        type: 'course.completed',
        completedCourseCount: 1,
      });

      expect(stellarService.mintBadge).toHaveBeenCalledTimes(1);
      expect(stellarService.mintBadge).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: learnerId,
          badgeId: firstCompletionBadge.id,
        }),
      );
    });

    it('mints once for each newly awarded badge across events', async () => {
      await service.evaluateAndAward(learnerId, {
        type: 'course.completed',
        completedCourseCount: 1,
      });
      await service.evaluateAndAward(learnerId, {
        type: 'streak.updated',
        streakDays: 7,
      });

      expect(stellarService.mintBadge).toHaveBeenCalledTimes(2);
      expect(stellarService.mintBadge).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ badgeId: firstCompletionBadge.id }),
      );
      expect(stellarService.mintBadge).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ badgeId: streak7Badge.id }),
      );
    });
  });
});