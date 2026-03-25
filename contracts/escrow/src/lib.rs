#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env,
};

#[contract]
pub struct Contract;

#[contracttype]
pub enum DataKey {
    Depositor,
    Beneficiary,
    Arbiter,
    Token,
    Amount,
    DeadlineLedger,
    Funded,
    Closed,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EscrowError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    InvalidDeadline = 4,
    AlreadyFunded = 5,
    NotFunded = 6,
    AlreadyClosed = 7,
    Unauthorized = 8,
    DeadlineNotReached = 9,
}

fn read_or_panic<T: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(env: &Env, key: &DataKey) -> T {
    env.storage()
        .instance()
        .get(key)
        .unwrap_or_else(|| panic_with_error!(env, EscrowError::NotInitialized))
}

fn assert_initialized(env: &Env) {
    if !env.storage().instance().has(&DataKey::Depositor) {
        panic_with_error!(env, EscrowError::NotInitialized);
    }
}

#[contractimpl]
impl Contract {
    pub fn init(
        env: Env,
        depositor: Address,
        beneficiary: Address,
        arbiter: Address,
        token: Address,
        amount: i128,
        deadline_ledger: u32,
    ) {
        if env.storage().instance().has(&DataKey::Depositor) {
            panic_with_error!(&env, EscrowError::AlreadyInitialized);
        }
        if amount <= 0 {
            panic_with_error!(&env, EscrowError::InvalidAmount);
        }
        if deadline_ledger <= env.ledger().sequence() {
            panic_with_error!(&env, EscrowError::InvalidDeadline);
        }

        env.storage()
            .instance()
            .set(&DataKey::Depositor, &depositor);
        env.storage()
            .instance()
            .set(&DataKey::Beneficiary, &beneficiary);
        env.storage().instance().set(&DataKey::Arbiter, &arbiter);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Amount, &amount);
        env.storage()
            .instance()
            .set(&DataKey::DeadlineLedger, &deadline_ledger);
        env.storage().instance().set(&DataKey::Funded, &false);
        env.storage().instance().set(&DataKey::Closed, &false);
    }

    pub fn fund(env: Env) {
        assert_initialized(&env);

        let funded: bool = read_or_panic(&env, &DataKey::Funded);
        if funded {
            panic_with_error!(&env, EscrowError::AlreadyFunded);
        }

        let depositor: Address = read_or_panic(&env, &DataKey::Depositor);
        let token: Address = read_or_panic(&env, &DataKey::Token);
        let amount: i128 = read_or_panic(&env, &DataKey::Amount);

        depositor.require_auth();

        token::Client::new(&env, &token).transfer(
            &depositor,
            &env.current_contract_address(),
            &amount,
        );
        env.storage().instance().set(&DataKey::Funded, &true);
    }

    pub fn release(env: Env, by: Address) {
        assert_initialized(&env);

        let funded: bool = read_or_panic(&env, &DataKey::Funded);
        if !funded {
            panic_with_error!(&env, EscrowError::NotFunded);
        }
        let closed: bool = read_or_panic(&env, &DataKey::Closed);
        if closed {
            panic_with_error!(&env, EscrowError::AlreadyClosed);
        }

        let depositor: Address = read_or_panic(&env, &DataKey::Depositor);
        let arbiter: Address = read_or_panic(&env, &DataKey::Arbiter);
        if by != depositor && by != arbiter {
            panic_with_error!(&env, EscrowError::Unauthorized);
        }
        by.require_auth();

        let beneficiary: Address = read_or_panic(&env, &DataKey::Beneficiary);
        let token: Address = read_or_panic(&env, &DataKey::Token);
        let amount: i128 = read_or_panic(&env, &DataKey::Amount);

        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &beneficiary,
            &amount,
        );
        env.storage().instance().set(&DataKey::Closed, &true);
    }

    pub fn refund(env: Env, by: Address) {
        assert_initialized(&env);

        let funded: bool = read_or_panic(&env, &DataKey::Funded);
        if !funded {
            panic_with_error!(&env, EscrowError::NotFunded);
        }
        let closed: bool = read_or_panic(&env, &DataKey::Closed);
        if closed {
            panic_with_error!(&env, EscrowError::AlreadyClosed);
        }

        let depositor: Address = read_or_panic(&env, &DataKey::Depositor);
        let arbiter: Address = read_or_panic(&env, &DataKey::Arbiter);
        if by != depositor && by != arbiter {
            panic_with_error!(&env, EscrowError::Unauthorized);
        }
        by.require_auth();

        let deadline_ledger: u32 = read_or_panic(&env, &DataKey::DeadlineLedger);
        if env.ledger().sequence() < deadline_ledger {
            panic_with_error!(&env, EscrowError::DeadlineNotReached);
        }

        let token: Address = read_or_panic(&env, &DataKey::Token);
        let amount: i128 = read_or_panic(&env, &DataKey::Amount);
        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &depositor,
            &amount,
        );
        env.storage().instance().set(&DataKey::Closed, &true);
    }

    pub fn status(env: Env) -> (bool, bool) {
        assert_initialized(&env);
        let funded: bool = read_or_panic(&env, &DataKey::Funded);
        let closed: bool = read_or_panic(&env, &DataKey::Closed);
        (funded, closed)
    }
}

mod test;
