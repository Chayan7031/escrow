#![cfg(test)]

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{token, Address, Env};

fn setup(
    env: &Env,
) -> (
    Address,
    Address,
    Address,
    Address,
    Address,
    ContractClient<'_>,
) {
    let depositor = Address::generate(env);
    let beneficiary = Address::generate(env);
    let arbiter = Address::generate(env);
    let admin = Address::generate(env);

    let token_admin = env.register_stellar_asset_contract_v2(admin);
    let token_id = token_admin.address();
    let token_client = token::StellarAssetClient::new(env, &token_id);
    token_client.mint(&depositor, &1_000);

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(env, &contract_id);

    (
        depositor,
        beneficiary,
        arbiter,
        token_id,
        contract_id,
        client,
    )
}

#[test]
fn fund_and_release_works() {
    let env = Env::default();
    env.mock_all_auths();

    let (depositor, beneficiary, arbiter, token_id, contract_id, client) = setup(&env);
    let token_client = token::Client::new(&env, &token_id);

    client.init(&depositor, &beneficiary, &arbiter, &token_id, &500, &50);
    client.fund();

    assert_eq!(token_client.balance(&depositor), 500);
    assert_eq!(token_client.balance(&contract_id), 500);

    client.release(&arbiter);
    let status = client.status();

    assert_eq!(status, (true, true));
    assert_eq!(token_client.balance(&beneficiary), 500);
    assert_eq!(token_client.balance(&contract_id), 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn refund_before_deadline_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (depositor, beneficiary, arbiter, token_id, _, client) = setup(&env);

    client.init(&depositor, &beneficiary, &arbiter, &token_id, &300, &100);
    client.fund();
    client.refund(&depositor);
}

#[test]
fn refund_after_deadline_works() {
    let env = Env::default();
    env.mock_all_auths();

    let (depositor, beneficiary, arbiter, token_id, contract_id, client) = setup(&env);
    let token_client = token::Client::new(&env, &token_id);

    client.init(&depositor, &beneficiary, &arbiter, &token_id, &250, &20);
    client.fund();

    env.ledger().set_sequence_number(21);
    client.refund(&depositor);

    let status = client.status();
    assert_eq!(status, (true, true));
    assert_eq!(token_client.balance(&depositor), 1_000);
    assert_eq!(token_client.balance(&contract_id), 0);
    assert_eq!(token_client.balance(&beneficiary), 0);
}
