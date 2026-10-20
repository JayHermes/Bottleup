import React, { useRef, useState } from 'react'
import { ArrowRight, Download, Share, X } from './Icons.jsx'
import { BrandMark } from './Brand.jsx'
import { captureReceipt } from '../lib/receipt-image.js'

const BOTTLES_PER_KG = 50

export default function ReceiptModal({ request, earnedPoints, onClose }) {
  const receiptRef = useRef(null)
  const [exporting, setExporting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [shareNotice, setShareNotice] = useState('')
  const receiptSignature = request.solana_tx_signature || request.onchain_tx_signature
  const receiptAddress = request.solana_receipt_address || request.onchain_record_account
  const explorerUrl = receiptSignature
    ? `https://explorer.solana.com/tx/${receiptSignature}?cluster=devnet`
    : receiptAddress ? `https://explorer.solana.com/address/${receiptAddress}?cluster=devnet` : null
  const bottleCount = Math.round(Number(request.actual_weight_kg || 0) * BOTTLES_PER_KG)
  const copyHash = () => { navigator.clipboard?.writeText(request.verification_hash || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const receiptFileName = `bottleup-receipt-${request.id.slice(0, 8)}.png`

  // Renders the receipt once and hands back both the image (for sharing/saving
  // as a file) and the canvas (to fall back to a data URL where Blob won't do).
  const getReceiptImage = async () => {
    const canvas = await captureReceipt(receiptRef.current)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    return { canvas, blob, file: blob && new File([blob], receiptFileName, { type: 'image/png' }) }
  }

  const saveReceiptFile = (canvas, blob) => {
    const url = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.download = receiptFileName
    link.href = url
    link.click()
    if (blob) setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const shareReceipt = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const title = 'My BottleUp recycling receipt'
      const text = `${bottleCount.toLocaleString()} bottles recycled on BottleUp — ${earnedPoints.toLocaleString()} points earned.`
      const { canvas, blob, file } = await getReceiptImage()
      try {
        // Share the receipt image itself wherever the platform supports file sharing.
        if (file && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title, text }); return
        }
        if (navigator.share) { await navigator.share({ title, text, url: explorerUrl || undefined }); return }
      } catch (err) { if (err?.name === 'AbortError') return }
      // No native share sheet (or it only takes text) — save the receipt image
      // itself instead of silently downgrading to a text-only clipboard copy.
      saveReceiptFile(canvas, blob)
      setShareNotice('Receipt image saved — share it from there')
      setTimeout(() => setShareNotice(''), 2400)
    } catch { setShareNotice('Could not create the receipt image. Please try again.') }
    finally { setExporting(false) }
  }

  const downloadReceipt = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const { canvas, blob } = await getReceiptImage()
      saveReceiptFile(canvas, blob)
    } catch { setShareNotice('Could not create the receipt image. Please try again.') }
    finally { setExporting(false) }
  }

  return <div className="authGate" onClick={onClose}>
    <div ref={receiptRef} className="authCard receiptCard" onClick={e => e.stopPropagation()}>
      <button data-receipt-control className="iconButton authBack" onClick={onClose}><X size={18} /></button>
      <div className="authBrand"><div className="logoMark" style={{ width: 34, height: 34, background: 'transparent', boxShadow: 'none' }} aria-hidden="true"><BrandMark size={34} /></div><span>Bottle<span>Up</span></span></div>
      <h1 className="authTitle">Recycling receipt</h1>
      <p className="authCopy">A verified record of this collection.</p>
      <div className="receiptRows">
        <div><span>Material</span><strong>{request.material_type}</strong></div>
        <div><span>Bottles recycled</span><strong>{bottleCount.toLocaleString()}</strong></div>
        <div><span>Verified weight</span><strong>{request.actual_weight_kg} kg</strong></div>
        <div><span>Points awarded</span><strong>{earnedPoints.toLocaleString()} pts</strong></div>
        <div><span>Verified</span><strong>{request.verified_at ? new Date(request.verified_at).toLocaleString() : '—'}</strong></div>
      </div>
      {request.verification_hash && (
        <div className="receiptHash">
          <span>Verification hash</span>
          <div className="receiptHashRow"><code>{request.verification_hash}</code><button data-receipt-control onClick={copyHash}>{copied ? 'Copied' : 'Copy'}</button></div>
        </div>
      )}
      {explorerUrl ? (
        <>
          <a className="primary" style={{ textAlign: 'center' }} href={explorerUrl} target="_blank" rel="noreferrer">View proof on Solana Explorer <ArrowRight size={16} /></a>
          {receiptAddress && (
            <a className="textButton" style={{ textAlign: 'center', marginTop: 8 }} href={`https://explorer.solana.com/address/${receiptAddress}?cluster=devnet`} target="_blank" rel="noreferrer">View permanent record account <ArrowRight size={14} /></a>
          )}
        </>
      ) : (
        <div className="authMessage">Onchain proof is still being submitted — check back shortly.</div>
      )}
      <div data-receipt-control className="receiptShareRow" aria-busy={exporting}>
        <button className="secondary" onClick={shareReceipt} disabled={exporting}><Share size={15} /> Share</button>
        <button className="secondary" onClick={downloadReceipt} disabled={exporting}><Download size={15} /> Download image</button>
      </div>
      {shareNotice && <div data-receipt-control role="status" className="authMessage" style={{ textAlign: 'center' }}>{shareNotice}</div>}
    </div>
  </div>
}

