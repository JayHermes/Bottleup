// Export the displayed receipt with its computed styles. Embed the local
// brand font explicitly; no external font stylesheet is needed for export.
let fontCSS
async function embeddedReceiptFont() {
  if (!fontCSS) {
    fontCSS = (async () => {
      const response = await fetch('/fonts/google-sans-flex-latin.woff2')
      if (!response.ok) throw new Error('Receipt font unavailable')
      const blob = await response.blob()
      const dataURL = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      return `@font-face { font-family: BottleSans; src: url("${dataURL}") format("woff2"); font-weight: 100 1000; }`
    })().catch(error => { fontCSS = null; throw error })
  }
  return fontCSS
}

export async function captureReceipt(node) {
  if (!node) throw new Error('Receipt is no longer open')
  await document.fonts.ready
  const [{ toCanvas }, fontEmbedCSS] = await Promise.all([
    import('html-to-image'), embeddedReceiptFont(),
  ])
  return toCanvas(node, {
    pixelRatio: 3,
    fontEmbedCSS,
    height: node.scrollHeight,
    filter: child => !child.hasAttribute?.('data-receipt-control'),
    style: { maxHeight: 'none', overflow: 'visible', boxShadow: 'none' },
  })
}
