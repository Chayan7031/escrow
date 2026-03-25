import {
  Address,
  Asset,
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
} from '@stellar/stellar-sdk'
import {
  getAddress,
  isAllowed,
  requestAccess,
  signTransaction,
} from '@stellar/freighter-api'

export const RPC_URL = 'https://soroban-testnet.stellar.org'
export const NETWORK_PASSPHRASE = Networks.TESTNET
export const NATIVE_XLM_SAC_CONTRACT_ID = Asset.native().contractId(NETWORK_PASSPHRASE)

const CONTRACT_ID =
  import.meta.env.VITE_ESCROW_CONTRACT_ID ??
  'CA2ROAQ34QAWKMPKZLCEP7GUD5GSREVFET5XKSIDQ3ENLWKGNZUW67IC'

const server = new rpc.Server(RPC_URL)

export const getLatestLedgerSequence = async (): Promise<number> => {
  const latest = await server.getLatestLedger()
  return latest.sequence
}

const toScVal = (value: string | number | bigint, type: 'address' | 'i128' | 'u32') => {
  if (type === 'address') {
    return new Address(value as string).toScVal()
  }
  if (type === 'u32') {
    return nativeToScVal(Number(value), { type: 'u32' })
  }
  return nativeToScVal(BigInt(value), { type: 'i128' })
}

export const getWalletAddress = async (): Promise<string | null> => {
  const { isAllowed: allowed } = await isAllowed()
  if (!allowed) {
    const access = await requestAccess()
    if (access.error) {
      throw new Error(access.error)
    }
  }

  const result = await getAddress()
  if (result.error) {
    throw new Error(result.error)
  }
  return result.address ?? null
}

const signAndSend = async (xdr: string): Promise<string> => {
  const signed = await signTransaction(xdr, {
    networkPassphrase: NETWORK_PASSPHRASE,
  })
  if (signed.error || !signed.signedTxXdr) {
    throw new Error(signed.error ?? 'Unable to sign transaction with Freighter')
  }

  const tx = TransactionBuilder.fromXDR(signed.signedTxXdr, NETWORK_PASSPHRASE)
  const sendResult = await server.sendTransaction(tx)

  if (sendResult.status === 'ERROR') {
    throw new Error('Transaction submission failed')
  }

  let getResponse = await server.getTransaction(sendResult.hash)
  while (getResponse.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    await new Promise((resolve) => setTimeout(resolve, 1200))
    getResponse = await server.getTransaction(sendResult.hash)
  }

  if (getResponse.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction failed with status: ${getResponse.status}`)
  }

  return sendResult.hash
}

const invoke = async (
  source: string,
  method: string,
  args: Array<{ value: string | number | bigint; type: 'address' | 'i128' | 'u32' }>,
  send = true,
) => {
  const account = await server.getAccount(source)
  const contract = new Contract(CONTRACT_ID)
  const op = contract.call(
    method,
    ...args.map((arg) => toScVal(arg.value, arg.type)),
  )

  const tx = new TransactionBuilder(account, {
    fee: '10000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(30)
    .build()

  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error)
  }

  if (!send) {
    if (!sim.result?.retval) {
      return null
    }
    return scValToNative(sim.result.retval)
  }

  const prepared = rpc.assembleTransaction(tx, sim).build()
  const hash = await signAndSend(prepared.toXDR())
  return hash
}

export const escrowClient = {
  contractId: CONTRACT_ID,
  getLatestLedgerSequence,
  init: async (
    source: string,
    params: {
      depositor: string
      beneficiary: string
      arbiter: string
      token: string
      amount: string
      deadlineLedger: string
    },
  ) =>
    invoke(source, 'init', [
      { value: params.depositor, type: 'address' },
      { value: params.beneficiary, type: 'address' },
      { value: params.arbiter, type: 'address' },
      { value: params.token || NATIVE_XLM_SAC_CONTRACT_ID, type: 'address' },
      { value: BigInt(params.amount || '0'), type: 'i128' },
      { value: Number(params.deadlineLedger || '0'), type: 'u32' },
    ]),
  fund: async (source: string) => invoke(source, 'fund', []),
  release: async (source: string, by: string) =>
    invoke(source, 'release', [{ value: by, type: 'address' }]),
  refund: async (source: string, by: string) =>
    invoke(source, 'refund', [{ value: by, type: 'address' }]),
  status: async (source: string) => invoke(source, 'status', [], false),
}
