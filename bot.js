const http = require('http');
http.createServer((req,res)=>{res.writeHead(200);res.end('Bot is running')}).listen(process.env.PORT || 3000);
const { default: makeWASocket, useMultiFileAuthState, downloadContentFromMessage } = require('@whiskeysockets/baileys')
const pino = require('pino')
const sharp = require('sharp')
const fs = require('fs')
const ffmpeg = require('fluent-ffmpeg')
const ffmpegPath = require('ffmpeg-static')
ffmpeg.setFfmpegPath(ffmpegPath)

const OWNER = '6285185602677'
const KATA_JOROK = ['ambatukam', 'ambatukan', 'penis', 'kontol', 'memek', 'ngentot', 'bokep', 'porn', 'sex', 'telanjang', 'bugil', 'vagina', 'titit', 'ngocok']

// === DATA AFK ===
const afkData = new Map() // simpan siapa yang lagi AFK

function formatDurasi(ms) {
    let detik = Math.floor(ms / 1000)
    let menit = Math.floor(detik / 60)
    let jam = Math.floor(menit / 60)
    let hari = Math.floor(jam / 24)
    detik = detik % 60
    menit = menit % 60
    jam = jam % 24
    let hasil = []
    if (hari > 0) hasil.push(hari + ' hari')
    if (jam > 0) hasil.push(jam + ' jam')
    if (menit > 0) hasil.push(menit + ' menit')
    if (detik > 0 || hasil.length === 0) hasil.push(detik + ' detik')
    return hasil.join(' ')
}

const KAMUS = {
    'kucing': 'cat', 'anjing': 'dog', 'meme jomok': 'funny meme', 'jomok': 'funny meme', 'meme': 'funny meme', 'kucing lucu': 'funny cat', 'pantai': 'beach', 'gunung': 'mountain', 'makanan': 'food', 'bunga': 'flower',
}
function translate(q) {
    let hasil = q.toLowerCase()
    if (KAMUS[hasil]) return KAMUS[hasil]
    for (let indo in KAMUS) hasil = hasil.replaceAll(indo, KAMUS[indo])
    return hasil
}
async function cariGambar(queryInggris) {
    try {
        const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=' + encodeURIComponent(queryInggris) + '&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url&iiurlwidth=500'
        const res = await fetch(url, { headers: { 'User-Agent': 'BotWA/1.0' } })
        const data = await res.json()
        const pages = data.query ? Object.values(data.query.pages) : []
        return pages.filter(p => p.imageinfo && p.imageinfo[0].thumburl).map(p => p.imageinfo[0].thumburl)
    } catch (e) { return [] }
}

async function buatBrat(teks) {
    const w = 1080, h = 1080
    const svg = `<svg width="${w}" height="${h}"><rect width="100%" height="100%" fill="white"/><text x="50%" y="52%" font-family="Arial Narrow, Arial" font-size="130" font-weight="bold" fill="black" text-anchor="middle" dominant-baseline="middle">${teks.toLowerCase().replace(/&/g,'&amp;')}</text></svg>`
    const buf = await sharp(Buffer.from(svg)).png().blur(0.6).toBuffer()
    return buf
}

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState('auth')
    const sock = makeWASocket({ auth: state, logger: pino({ level: 'silent' }), printQRInTerminal: true })
    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('connection.update', (u) => { if (u.connection === 'open') console.log('BERHASIL CONNECT! BOT JALAN!') })

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0]
        if (!msg.message || msg.key.fromMe) return
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '').trim()
        const from = msg.key.remoteJid
        const lower = text.toLowerCase()
        const sender = msg.key.participant || msg.key.remoteJid // siapa yang chat
        const senderName = msg.pushName || 'Bro'

        // === CEK APAKAH YANG CHAT LAGI AFK TERUS BALIK ===
        // Kalo dia chat lagi dan bukan perintah afk lagi, berarti dia udah balik
        if (afkData.has(sender) && !lower.startsWith('afk')) {
            const dataAfk = afkData.get(sender)
            const durasi = formatDurasi(Date.now() - dataAfk.start)
            afkData.delete(sender)
            await sock.sendMessage(from, { text: `Welcome back @${sender.split('@')[0]}! 👋\n\nLu udah AFK selama *${durasi}*\nAlasan AFK: ${dataAfk.reason}\nSelamat datang kembali!`, mentions: [sender] })
            // jangan return, biar chatnya tetep diproses kalo dia ketik perintah lain
        }

        // === CEK APAKAH ADA YANG NGETAG / REPLY ORANG YANG LAGI AFK ===
        const ctx = msg.message.extendedTextMessage?.contextInfo
        const mentioned = ctx?.mentionedJid || []
        const replyTo = ctx?.participant
        const semuaTag = [...mentioned]
        if (replyTo) semuaTag.push(replyTo)
        for (let tagOrang of semuaTag) {
            if (afkData.has(tagOrang)) {
                const dataAfk = afkData.get(tagOrang)
                const durasi = formatDurasi(Date.now() - dataAfk.start)
                await sock.sendMessage(from, { text: `Orang yang lu tag lagi AFK bro!\n\nAlasan: ${dataAfk.reason}\nUdah AFK selama: *${durasi}*\nJangan diganggu dulu ya 🙏`, mentions: [tagOrang] })
            }
        }

        // === PERINTAH AFK ===
        if (lower === 'afk' || lower.startsWith('afk ')) {
            const alasan = text.slice(3).trim() || 'Tanpa alasan'
            afkData.set(sender, { reason: alasan, start: Date.now() })
            return await sock.sendMessage(from, { text: `Oke @${sender.split('@')[0]} sekarang AFK ya!\nAlasan: ${alasan}\n\nNanti kalo lu chat lagi, gua kasih tau berapa lama lu AFK.`, mentions: [sender] })
        }

        if (lower === 'afklist' || lower === 'cek afk') {
            if (afkData.size === 0) return await sock.sendMessage(from, { text: 'Gak ada yang lagi AFK bro, semua online' })
            let list = '*LIST YANG LAGI AFK:*\n\n'
            for (let [id, data] of afkData) {
                list += `@${id.split('@')[0]} - ${data.reason} (${formatDurasi(Date.now() - data.start)})\n`
            }
            return await sock.sendMessage(from, { text: list, mentions: [...afkData.keys()] })
        }

        // === DELETE / D ===
        if (lower === 'd' || lower === 'delete' || lower === 'del' || lower === 'hapus') {
            const ctx2 = msg.message.extendedTextMessage?.contextInfo
            if (!ctx2 || !ctx2.stanzaId) return await sock.sendMessage(from, { text: 'Reply pesan yang mau dihapus dulu bro, baru ketik d' })
            try {
                const isBotMsg = ctx2.participant ? ctx2.participant.includes(sock.user.id.split(':')[0]) : true
                await sock.sendMessage(from, { delete: { remoteJid: from, fromMe: isBotMsg, id: ctx2.stanzaId, participant: ctx2.participant } })
                return
            } catch (e) { return await sock.sendMessage(from, { text: 'Gagal hapus, bot harus admin / pesannya udah kelamaan bro' }) }
        }

        // === BRAT ===
        if (lower.startsWith('brat ') && !lower.startsWith('bratvid')) {
            const isi = text.slice(5).trim()
            if (!isi) return await sock.sendMessage(from, { text: 'Contoh: brat poi' })
            if (KATA_JOROK.some(k => isi.toLowerCase().includes(k))) return await sock.sendMessage(from, { text: 'Jangan yang jorok bro' })
            const img = await buatBrat(isi)
            const webp = await sharp(img).resize(512, 512).webp().toBuffer()
            return await sock.sendMessage(from, { sticker: webp })
        }

        // === BRATVID ===
        if (lower.startsWith('bratvid ')) {
            const isi = text.slice(8).trim() || 'brat'
            try {
                await sock.sendMessage(from, { text: 'Bentar, gua ketik kata-katanya satu-satu...' })
                const kataKata = isi.split(' ').filter(k => k.length > 0)
                const frames = []
                let nomorFrame = 1
                for (let i = 1; i <= kataKata.length; i++) {
                    const potong = kataKata.slice(0, i).join(' ')
                    const buf = await buatBrat(potong)
                    const framePath = `./brat_frame_${nomorFrame}.png`
                    await sharp(buf).resize(512, 512).toFile(framePath)
                    frames.push(framePath)
                    nomorFrame++
                }
                const full = kataKata.join(' ')
                const bufAkhir = await buatBrat(full)
                for (let j = 0; j < 3; j++) {
                    const frameAkhir = `./brat_frame_${nomorFrame}.png`
                    await sharp(bufAkhir).resize(512, 512).toFile(frameAkhir)
                    frames.push(frameAkhir)
                    nomorFrame++
                }
                const webpPath = './bratvid_tmp.webp'
                const mp4Path = './bratvid_tmp.mp4'
                await new Promise((res, rej) => { ffmpeg('./brat_frame_%d.png').inputFPS(1.4).outputOptions(['-vcodec', 'libwebp', '-lossless', '0', '-qscale', '75', '-preset', 'default', '-loop', '0', '-an', '-vsync', '0']).save(webpPath).on('end', res).on('error', rej) })
                await new Promise((res, rej) => { ffmpeg('./brat_frame_%d.png').inputFPS(1.4).outputOptions(['-vcodec', 'libx264', '-pix_fmt', 'yuv420p', '-loop', '0']).save(mp4Path).on('end', res).on('error', rej) })
                const mp4Buffer = fs.readFileSync(mp4Path)
                await sock.sendMessage(from, { video: mp4Buffer, gifPlayback: true, caption: full })
                const webpBuffer = fs.readFileSync(webpPath)
                await sock.sendMessage(from, { sticker: webpBuffer })
                frames.forEach(f => { try { fs.unlinkSync(f) } catch(e){} })
                try { fs.unlinkSync(webpPath) } catch(e){}
                try { fs.unlinkSync(mp4Path) } catch(e){}
            } catch (e) { await sock.sendMessage(from, { text: 'Gagal bratvid: ' + e.message }) }
            return
        }

        // === PINTEREST VIDEO ===
        if (lower.startsWith('pindl ') || lower.startsWith('pinvid ')) {
            const link = text.split(' ')[1]
            if (!link) return await sock.sendMessage(from, { text: 'Contoh: pindl https://pin.it/xxxx' })
            try {
                await sock.sendMessage(from, { text: 'Bentar, gua download video Pinterest-nya...' })
                const api = 'https://api.pinterest-downloader.vercel.app/api?url=' + encodeURIComponent(link)
                const res = await fetch(api)
                const data = await res.json()
                const videoUrl = data?.data?.video || data?.video || data?.url
                if (!videoUrl) return await sock.sendMessage(from, { text: 'Gagal dapet videonya bro, coba link pin lain yang publik' })
                await sock.sendMessage(from, { video: { url: videoUrl }, caption: 'Nih video Pinterest lu' })
            } catch (e) { await sock.sendMessage(from, { text: 'Gagal download: ' + e.message }) }
            return
        }

        // === STIKER FOTO ===
        if (lower === 's' || lower === 'stiker' || lower === 'stc' || lower === 'sticker') {
            try {
                let imageMsg = msg.message.imageMessage
                if (!imageMsg && msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) imageMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage
                if (!imageMsg) return await sock.sendMessage(from, { text: 'Kirim foto + caption "s" bro' })
                const stream = await downloadContentFromMessage(imageMsg, 'image')
                let buffer = Buffer.from([])
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk])
                const webp = await sharp(buffer).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp().toBuffer()
                await sock.sendMessage(from, { sticker: webp })
                return
            } catch (e) { return await sock.sendMessage(from, { text: 'Gagal stiker: ' + e.message }) }
        }

        if (lower === 'ping') await sock.sendMessage(from, { text: 'pong! bot jalan bro' })
        if (lower === 'menu') await sock.sendMessage(from, { text: `*MENU BOT*\n\n- ping\n- menu\n- owner\n- afk mau makan = set AFK\n- afklist = liat siapa yang AFK\n- pin kucing\n- brat poi = stiker diam\n- bratvid halo bot poke = video gif + stiker animasi\n- pindl <link pinterest>\n- Kirim foto + caption s = stiker\n- Reply pesan + d = hapus pesan itu` })
        if (lower === 'owner') await sock.sendMessage(from, { text: `OWNER: +${OWNER}` })

        let query = null
        if (lower.startsWith('pin ')) query = text.slice(4)
        else if (lower.startsWith('cari ')) query = text.slice(5)
        if (query) {
            if (KATA_JOROK.some(kata => lower.includes(kata))) return await sock.sendMessage(from, { text: 'Waduh jangan yang jorok bro' })
            try {
                const queryInggris = translate(query)
                await sock.sendMessage(from, { text: 'Nyariin ' + query + '...' })
                const results = await cariGambar(queryInggris)
                if (!results.length) return await sock.sendMessage(from, { text: 'Gak ketemu bro' })
                const random = results[Math.floor(Math.random() * results.length)]
                await sock.sendMessage(from, { image: { url: random }, caption: 'Nih: ' + query })
            } catch (e) { await sock.sendMessage(from, { text: 'Error: ' + e.message }) }
        }
    })
}
start()
