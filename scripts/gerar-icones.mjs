import sharp from 'sharp'

function buildSVG(size) {
  const s = size / 300

  const lw = 88 * s, lh = 80 * s
  const lx = size / 2 - lw / 2, ly = 36 * s
  const coinX = lx + lw + 2 * s, coinY = ly - 2 * s, coinR = 18 * s

  const lineYs = [ly + 19 * s, ly + 34 * s, ly + 49 * s, ly + 64 * s]
  const lineWidths = [lw - 22 * s, lw - 30 * s, lw - 38 * s, lw - 30 * s]
  const ledgerLines = lineYs.map((y, i) =>
    `<rect x="${lx + 18 * s}" y="${y}" width="${lineWidths[i]}" height="${2.5 * s}" rx="${1.5 * s}" fill="rgba(11,45,26,${i === 0 ? 0.28 : 0.16})"/>`
  ).join('\n    ')

  const fSize = { fiado: Math.round(78 * s), app: Math.round(54 * s), rs: Math.round(10 * s) }
  const barW = 210 * s

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#0B2D1A"/>
  <rect x="${lx + 7 * s}" y="${ly + 7 * s}" width="${lw}" height="${lh}" rx="${9 * s}" fill="rgba(255,255,255,0.15)"/>
  <rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="${9 * s}" fill="#FFFFFF"/>
  <rect x="${lx}" y="${ly}" width="${13 * s}" height="${lh}" rx="${9 * s}" fill="#C8E8D5"/>
  <rect x="${lx + 6 * s}" y="${ly}" width="${7 * s}" height="${lh}" fill="#C8E8D5"/>
  ${ledgerLines}
  <circle cx="${coinX + 1 * s}" cy="${coinY + 2 * s}" r="${coinR}" fill="rgba(0,0,0,0.3)"/>
  <circle cx="${coinX}" cy="${coinY}" r="${coinR}" fill="#E8920A"/>
  <circle cx="${coinX}" cy="${coinY}" r="${coinR * 0.68}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="${1.5 * s}"/>
  <text x="${coinX}" y="${coinY}" text-anchor="middle" dominant-baseline="central"
    font-family="Arial, sans-serif" font-weight="700" font-size="${fSize.rs}" fill="white">R$</text>
  <text x="${size / 2}" y="${200 * s}" text-anchor="middle"
    font-family="Arial, sans-serif" font-weight="900" font-size="${fSize.fiado}" fill="#FFFFFF">Fiado</text>
  <rect x="${size / 2 - barW / 2}" y="${208 * s}" width="${barW}" height="${4.5 * s}" rx="${2.5 * s}" fill="#E8920A"/>
  <text x="${size / 2}" y="${264 * s}" text-anchor="middle"
    font-family="Arial, sans-serif" font-weight="700" font-size="${fSize.app}" fill="#E8920A">App</text>
</svg>`
}

function buildAndroidFg(size) {
  const inner = Math.round(size * 0.66)
  const off = Math.round((size - inner) / 2)
  const s = inner / 300

  const lw = 88 * s, lh = 80 * s
  const lx = inner / 2 - lw / 2 + off, ly = 36 * s + off
  const coinX = lx + lw + 2 * s, coinY = ly - 2 * s, coinR = 18 * s

  const lineYs = [ly + 19 * s, ly + 34 * s, ly + 49 * s, ly + 64 * s]
  const lineWidths = [lw - 22 * s, lw - 30 * s, lw - 38 * s, lw - 30 * s]
  const ledgerLines = lineYs.map((y, i) =>
    `<rect x="${lx + 18 * s}" y="${y}" width="${lineWidths[i]}" height="${2.5 * s}" rx="${1.5 * s}" fill="rgba(11,45,26,${i === 0 ? 0.28 : 0.16})"/>`
  ).join('\n    ')

  const fSize = { fiado: Math.round(78 * s), app: Math.round(54 * s), rs: Math.round(10 * s) }
  const barW = 210 * s
  const fiadoY = 200 * s + off, barY = 208 * s + off, appY = 264 * s + off

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${lx + 7 * s}" y="${ly + 7 * s}" width="${lw}" height="${lh}" rx="${9 * s}" fill="rgba(255,255,255,0.15)"/>
  <rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="${9 * s}" fill="#FFFFFF"/>
  <rect x="${lx}" y="${ly}" width="${13 * s}" height="${lh}" rx="${9 * s}" fill="#C8E8D5"/>
  <rect x="${lx + 6 * s}" y="${ly}" width="${7 * s}" height="${lh}" fill="#C8E8D5"/>
  ${ledgerLines}
  <circle cx="${coinX + 1 * s}" cy="${coinY + 2 * s}" r="${coinR}" fill="rgba(0,0,0,0.3)"/>
  <circle cx="${coinX}" cy="${coinY}" r="${coinR}" fill="#E8920A"/>
  <circle cx="${coinX}" cy="${coinY}" r="${coinR * 0.68}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="${1.5 * s}"/>
  <text x="${coinX}" y="${coinY}" text-anchor="middle" dominant-baseline="central"
    font-family="Arial, sans-serif" font-weight="700" font-size="${fSize.rs}" fill="white">R$</text>
  <text x="${size / 2}" y="${fiadoY}" text-anchor="middle"
    font-family="Arial, sans-serif" font-weight="900" font-size="${fSize.fiado}" fill="#FFFFFF">Fiado</text>
  <rect x="${size / 2 - barW / 2}" y="${barY}" width="${barW}" height="${4.5 * s}" rx="${2.5 * s}" fill="#E8920A"/>
  <text x="${size / 2}" y="${appY}" text-anchor="middle"
    font-family="Arial, sans-serif" font-weight="700" font-size="${fSize.app}" fill="#E8920A">App</text>
</svg>`
}

async function run() {
  const d = 'assets'

  await sharp(Buffer.from(buildSVG(1024))).png().toFile(`${d}/icon.png`)
  console.log('✓ icon.png (1024×1024)')

  await sharp(Buffer.from(buildSVG(512))).png().toFile(`${d}/icon-512.png`)
  console.log('✓ icon-512.png (512×512)')

  await sharp(Buffer.from(buildSVG(256))).resize(32, 32).png().toFile(`${d}/favicon.png`)
  console.log('✓ favicon.png (32×32)')

  await sharp(Buffer.from(buildSVG(200))).png().toFile(`${d}/splash-icon.png`)
  console.log('✓ splash-icon.png (200×200)')

  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 11, g: 45, b: 26, alpha: 1 } }
  }).png().toFile(`${d}/android-icon-background.png`)
  console.log('✓ android-icon-background.png')

  await sharp(Buffer.from(buildAndroidFg(1024))).png().toFile(`${d}/android-icon-foreground.png`)
  console.log('✓ android-icon-foreground.png')

  // Monocromático para notificações Android (branco puro em fundo transparente)
  const monoSVG = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  ${buildAndroidFg(1024)
    .replace(/<svg[^>]*>/, '')
    .replace('</svg>', '')
    .replace(/fill="#FFFFFF"/g, 'fill="white"')
    .replace(/fill="#E8920A"/g, 'fill="white"')
    .replace(/fill="#C8E8D5"/g, 'fill="rgba(255,255,255,0.6)"')
    .replace(/fill="rgba\(11,45,26[^"]*\)"/g, 'fill="rgba(0,0,0,0.15)"')
  }
</svg>`
  await sharp(Buffer.from(monoSVG)).png().toFile(`${d}/android-icon-monochrome.png`)
  console.log('✓ android-icon-monochrome.png')

  console.log('\n✅ Todos os ícones gerados!')
}

run().catch(e => { console.error(e); process.exit(1) })
