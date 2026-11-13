const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const pino = require('pino')
const http = require('http')

// GANTI NOMOR INI pake nomor WA yang mau jadi bot
// Pake kode negara, tanpa +, tanpa spasi, tanpa 0 di depan
// Contoh Indo: 6281234567890
const PHONE_NUMBER = '6281234567890'

// Biar Render ga error "No open ports"
const PORT = process.env.PORT || 3000
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Bot is running!')
}).listen(PORT, () => console.log('Server jalan di port ' + PORT))

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Bot WA', 'Chrome', '1.0']
  })

  sock.ev.on('creds.update', saveCreds)

  // MINTA KODE PAIRING KALO BELUM LOGIN
  if (!sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(PHONE_NUMBER)
        console.log('====================================')
        console.log('KODE PAIRING LU: ' + code)
        console.log('====================================')
        console.log('Cara pakai: Buka WA > Titik 3 > Perangkat Tertaut > Tautkan Perangkat > Tautkan dengan nomor telepon > Masukin kode di atas')
      } catch (e) {
        console.log('Gagal minta kode pairing:', e.message)
      }
    }, 3000)
  }

  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect } = u

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      console.log('Koneksi putus, reconnect:', shouldReconnect)
      if (shouldReconnect) start()
    }

    if (connection === 'open') {
      console.log('BERHASIL CONNECT! BOT JALAN!')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0]
    if (!m.message || m.key.fromMe) return
    const from = m.key.remoteJid
    const text = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim()

    if (text.toLowerCase() === '.menu' || text.toLowerCase() === 'menu') {
      await sock.sendMessage(from, { text: 'Halo! Bot jalan ✅\n\nMenu:\n.menu - liat menu\n.ping - cek bot hidup' })
    }

    if (text.toLowerCase() === '.ping' || text.toLowerCase() === 'ping') {
      await sock.sendMessage(from, { text: 'Pong! Bot aktif ✅' })
    }
  })
}

start()
