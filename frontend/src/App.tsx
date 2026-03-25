import { useMemo, useState } from 'react'
import {
  NATIVE_XLM_SAC_CONTRACT_ID,
  escrowClient,
  getWalletAddress,
} from './stellar'

type EscrowForm = {
  depositor: string
  beneficiary: string
  arbiter: string
  token: string
  amount: string
  deadlineOffset: string
}

const DEFAULT_CONTRACT = escrowClient.contractId

function App() {
  const [wallet, setWallet] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [byAddress, setByAddress] = useState('')
  const [latestLedger, setLatestLedger] = useState<number | null>(null)
  const [form, setForm] = useState<EscrowForm>({
    depositor: '',
    beneficiary: '',
    arbiter: '',
    token: NATIVE_XLM_SAC_CONTRACT_ID,
    amount: '',
    deadlineOffset: '120',
  })

  const canSubmit = useMemo(() => wallet.length > 0 && !busy, [wallet, busy])

  const withAction = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    setResult('')
    try {
      const output = await action()
      if (typeof output === 'string') {
        setResult(output)
      } else {
        setResult(JSON.stringify(output, null, 2))
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  const connect = async () => {
    setError('')
    setResult('')
    try {
      const address = await getWalletAddress()
      if (!address) {
        throw new Error('Could not fetch wallet address from Freighter')
      }
      const currentLedger = await escrowClient.getLatestLedgerSequence()
      setWallet(address)
      setLatestLedger(currentLedger)
      setByAddress((prev) => prev || address)
      setForm((prev) => ({ ...prev, depositor: prev.depositor || address }))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown wallet error'
      setError(message)
    }
  }

  const onField = (field: keyof EscrowForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const refreshLedger = async () => {
    try {
      const seq = await escrowClient.getLatestLedgerSequence()
      setLatestLedger(seq)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to refresh ledger'
      setError(message)
    }
  }

  const computedDeadline = useMemo(() => {
    if (!latestLedger) return ''
    const offset = Number(form.deadlineOffset || '0')
    if (!Number.isFinite(offset) || offset <= 0) return ''
    return String(latestLedger + Math.floor(offset))
  }, [latestLedger, form.deadlineOffset])

  return (
    <div className="app">
      <header className="hero">
        <p className="eyebrow">Stellar Testnet dApp</p>
        <h1>Escrow Control Room</h1>
        <p className="subtitle">
          Connect Freighter and invoke the deployed escrow contract from a clean,
          testnet-focused interface.
        </p>
      </header>

      <section className="panel">
        <div className="panel-title-row">
          <h2>Wallet</h2>
          <button className="btn" onClick={connect} disabled={busy}>
            {wallet ? 'Reconnect' : 'Connect Freighter'}
          </button>
        </div>
        <p className="mono wrap">{wallet || 'No wallet connected yet.'}</p>
        <div className="inline-meta">
          <span className="mono">Latest Ledger: {latestLedger ?? 'unknown'}</span>
          <button className="btn" onClick={refreshLedger} disabled={busy}>
            Refresh ledger
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Contract</h2>
        <p className="mono wrap">{DEFAULT_CONTRACT}</p>
      </section>

      <section className="panel form-grid">
        <h2>Initialize Escrow</h2>
        <label>
          Depositor
          <input
            value={form.depositor}
            onChange={(e) => onField('depositor', e.target.value)}
            placeholder="G..."
          />
        </label>
        <label>
          Beneficiary
          <input
            value={form.beneficiary}
            onChange={(e) => onField('beneficiary', e.target.value)}
            placeholder="G..."
          />
        </label>
        <label>
          Arbiter
          <input
            value={form.arbiter}
            onChange={(e) => onField('arbiter', e.target.value)}
            placeholder="G..."
          />
        </label>
        <label>
          Token Contract (SAC)
          <input
            value={form.token}
            onChange={(e) => onField('token', e.target.value)}
            placeholder={NATIVE_XLM_SAC_CONTRACT_ID}
          />
        </label>
        <p className="hint">
          Defaults to native XLM SAC on testnet. Replace only if you want a custom token.
        </p>
        <label>
          Amount (i128)
          <input
            value={form.amount}
            onChange={(e) => onField('amount', e.target.value)}
            placeholder="500"
          />
        </label>
        <label>
          Deadline Offset (ledgers)
          <input
            value={form.deadlineOffset}
            onChange={(e) => onField('deadlineOffset', e.target.value)}
            placeholder="120"
          />
        </label>
        <p className="hint">
          Computed deadline ledger: <span className="mono">{computedDeadline || 'N/A'}</span>
        </p>
        <button
          className="btn btn-primary"
          disabled={!canSubmit || !computedDeadline}
          onClick={() =>
            withAction(() =>
              escrowClient.init(wallet, {
                depositor: form.depositor,
                beneficiary: form.beneficiary,
                arbiter: form.arbiter,
                token: form.token,
                amount: form.amount,
                deadlineLedger: computedDeadline,
              }),
            )
          }
        >
          {busy ? 'Working...' : 'Initialize'}
        </button>
      </section>

      <section className="panel action-grid">
        <h2>Actions</h2>
        <label>
          By Address
          <input
            value={byAddress}
            onChange={(e) => setByAddress(e.target.value)}
            placeholder="G..."
          />
        </label>
        <div className="action-buttons">
          <button
            className="btn"
            disabled={!canSubmit}
            onClick={() => withAction(() => escrowClient.fund(wallet))}
          >
            Fund
          </button>
          <button
            className="btn"
            disabled={!canSubmit}
            onClick={() => withAction(() => escrowClient.release(wallet, byAddress))}
          >
            Release
          </button>
          <button
            className="btn"
            disabled={!canSubmit}
            onClick={() => withAction(() => escrowClient.refund(wallet, byAddress))}
          >
            Refund
          </button>
          <button
            className="btn"
            disabled={!canSubmit}
            onClick={() => withAction(() => escrowClient.status(wallet))}
          >
            Read Status
          </button>
        </div>
      </section>

      {result && (
        <section className="panel feedback success">
          <h2>Result</h2>
          <pre>{result}</pre>
        </section>
      )}

      {error && (
        <section className="panel feedback error">
          <h2>Error</h2>
          <pre>{error}</pre>
        </section>
      )}
    </div>
  )
}

export default App
