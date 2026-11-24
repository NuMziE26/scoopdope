#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolState {
    pub token_a: Address,
    pub token_b: Address,
    pub reserve_a: i128,
    pub reserve_b: i128,
    pub total_shares: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LiquidityPosition {
    pub shares: i128,
    pub amount_a: i128,
    pub amount_b: i128,
}

#[contract]
pub struct LiquidityPool;

#[contractimpl]
impl LiquidityPool {
    pub fn initialize(env: Env, token_a: Address, token_b: Address) {
        if env.storage().instance().has(&"pool") {
            panic!("already initialized");
        }
        let state = PoolState {
            token_a,
            token_b,
            reserve_a: 0,
            reserve_b: 0,
            total_shares: 0,
        };
        env.storage().instance().set(&"pool", &state);
    }

    pub fn get_pool(env: Env) -> PoolState {
        env.storage().instance().get(&"pool").expect("not initialized")
    }

    pub fn get_position(env: Env, provider: Address) -> LiquidityPosition {
        let shares: i128 = env
            .storage()
            .persistent()
            .get(&provider)
            .unwrap_or(0);
        let state = Self::get_pool(env.clone());
        let (amount_a, amount_b) = Self::shares_to_amounts(&state, shares);
        LiquidityPosition {
            shares,
            amount_a,
            amount_b,
        }
    }

    pub fn add_liquidity(
        env: Env,
        provider: Address,
        amount_a: i128,
        amount_b: i128,
    ) -> i128 {
        provider.require_auth();
        if amount_a <= 0 || amount_b <= 0 {
            panic!("amounts must be positive");
        }

        let mut state = Self::get_pool(env.clone());

        token::Client::new(&env, &state.token_a).transfer(
            &provider,
            &env.current_contract_address(),
            &amount_a,
        );
        token::Client::new(&env, &state.token_b).transfer(
            &provider,
            &env.current_contract_address(),
            &amount_b,
        );

        let shares = if state.total_shares == 0 {
            amount_a + amount_b
        } else {
            let shares_a = amount_a * state.total_shares / state.reserve_a;
            let shares_b = amount_b * state.total_shares / state.reserve_b;
            if shares_a < shares_b {
                shares_a
            } else {
                shares_b
            }
        };
        if shares <= 0 {
            panic!("insufficient liquidity minted");
        }

        state.reserve_a += amount_a;
        state.reserve_b += amount_b;
        state.total_shares += shares;
        env.storage().instance().set(&"pool", &state);

        let existing: i128 = env
            .storage()
            .persistent()
            .get(&provider)
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&provider, &(existing + shares));

        shares
    }

    pub fn remove_liquidity(env: Env, provider: Address, shares: i128) -> (i128, i128) {
        provider.require_auth();
        if shares <= 0 {
            panic!("shares must be positive");
        }

        let mut state = Self::get_pool(env.clone());
        let existing: i128 = env
            .storage()
            .persistent()
            .get(&provider)
            .unwrap_or(0);
        if shares > existing {
            panic!("insufficient shares");
        }

        let (amount_a, amount_b) = Self::shares_to_amounts(&state, shares);

        state.reserve_a -= amount_a;
        state.reserve_b -= amount_b;
        state.total_shares -= shares;
        env.storage().instance().set(&"pool", &state);

        let remaining = existing - shares;
        env.storage().persistent().set(&provider, &remaining);

        token::Client::new(&env, &state.token_a).transfer(
            &env.current_contract_address(),
            &provider,
            &amount_a,
        );
        token::Client::new(&env, &state.token_b).transfer(
            &env.current_contract_address(),
            &provider,
            &amount_b,
        );

        (amount_a, amount_b)
    }

    pub fn swap(env: Env, trader: Address, amount_in: i128, a_to_b: bool) -> i128 {
        trader.require_auth();
        if amount_in <= 0 {
            panic!("amount must be positive");
        }

        let mut state = Self::get_pool(env.clone());
        let (reserve_in, reserve_out, token_in, token_out) = if a_to_b {
            (
                state.reserve_a,
                state.reserve_b,
                state.token_a.clone(),
                state.token_b.clone(),
            )
        } else {
            (
                state.reserve_b,
                state.reserve_a,
                state.token_b.clone(),
                state.token_a.clone(),
            )
        };

        let amount_out = Self::get_amount_out(amount_in, reserve_in, reserve_out);
        if amount_out <= 0 || amount_out >= reserve_out {
            panic!("insufficient output amount");
        }

        token::Client::new(&env, &token_in).transfer(
            &trader,
            &env.current_contract_address(),
            &amount_in,
        );
        token::Client::new(&env, &token_out).transfer(
            &env.current_contract_address(),
            &trader,
            &amount_out,
        );

        if a_to_b {
            state.reserve_a += amount_in;
            state.reserve_b -= amount_out;
        } else {
            state.reserve_b += amount_in;
            state.reserve_a -= amount_out;
        }
        env.storage().instance().set(&"pool", &state);

        amount_out
    }

    pub fn get_amount_out(amount_in: i128, reserve_in: i128, reserve_out: i128) -> i128 {
        if amount_in <= 0 || reserve_in <= 0 || reserve_out <= 0 {
            panic!("invalid reserves");
        }
        let amount_in_with_fee = amount_in * 997;
        amount_in_with_fee * reserve_out / (reserve_in * 1000 + amount_in_with_fee)
    }

    fn shares_to_amounts(state: &PoolState, shares: i128) -> (i128, i128) {
        if shares == 0 || state.total_shares == 0 {
            return (0, 0);
        }
        (
            shares * state.reserve_a / state.total_shares,
            shares * state.reserve_b / state.total_shares,
        )
    }
}

#[cfg(test)]
mod test;
