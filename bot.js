const { Client, GatewayIntentBits } = require('discord.js');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const http = require('http');
require('dotenv').config();

// Mini-Webserver für Render
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!\n');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`HTTP server listening on port ${PORT}`);
});

async function startAternosServer(message) {
    let browser;
    let statusMessage;
    try {
        statusMessage = await message.reply('⏳ Connecting to Aternos and starting the server...');

        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const page = await browser.newPage();
        
        // User-Agent setzen, damit Aternos uns nicht sofort wie einen Bot aussperrt
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        await page.setRequestInterception(true);
        page.on('request', req => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Großzügigerer Timeout (90 Sekunden)
        await page.goto('https://aternos.org/go/', { waitUntil: 'networkidle2', timeout: 90000 });

        const alreadyLoggedIn = await page.$('a[href="/servers/"]');
        if (alreadyLoggedIn) {
            await alreadyLoggedIn.click();
        } else {
            const loginFrame = page.frames().find(f => f.url().includes('aternos'));
            if (!loginFrame) throw new Error('Login frame not found');

            await loginFrame.waitForSelector('input#user', { timeout: 15000 });
            await loginFrame.type('input#user', process.env.ATERNOS_USER, { delay: 50 });
            await loginFrame.type('input#password', process.env.ATERNOS_PASS, { delay: 50 });
            await loginFrame.click('button[type="submit"]');
        }

        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
        await page.goto('https://aternos.org/servers/', { waitUntil: 'networkidle2', timeout: 90000 });

        // Warten bis der Server-Body da ist
        await page.waitForSelector('div.server-body', { timeout: 30000 });
        await page.click('div.server-body');

        // Warten auf den Start-Button und klicken
        await page.waitForSelector('#start', { timeout: 30000 });
        const startBtn = await page.$('#start');
        if (startBtn) {
            await startBtn.click();
        }

        await statusMessage.edit('✅ Server is starting up!');
    } catch (err) {
        console.error('Error starting Aternos server:', err);
        if (statusMessage) await statusMessage.edit('❌ Timeout or error while starting Aternos server. Check Render logs.');
    } finally {
        if (browser) await browser.close();
    }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.once('ready', () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (message.content.trim().toLowerCase() === '!start') {
        await startAternosServer(message);
    }
});

client.login(process.env.DISCORD_TOKEN);
          
