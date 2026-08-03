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

        // Nutzen von @sparticuz/chromium für Render
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', req => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.goto('https://aternos.org/go/', { waitUntil: 'domcontentloaded', timeout: 60000 });

        const alreadyLoggedIn = await page.$('a[href="/servers/"]');
        if (alreadyLoggedIn) {
            await alreadyLoggedIn.click();
        } else {
            const loginFrame = page.frames().find(f => f.url().includes('aternos'));
            if (!loginFrame) throw new Error('Login frame not found');

            await loginFrame.waitForSelector('input#user', { timeout: 5000 });
            await loginFrame.type('input#user', process.env.ATERNOS_USER, { delay: 50 });
            await loginFrame.type('input#password', process.env.ATERNOS_PASS, { delay: 50 });
            await loginFrame.click('button[type="submit"]');
        }

        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await page.goto('https://aternos.org/servers/', { waitUntil: 'domcontentloaded', timeout: 60000 });

        await page.waitForSelector('div.server-body', { timeout: 15000 });
        await page.click('div.server-body');

        await page.waitForSelector('#start', { timeout: 20000 });
        
        const startBtn = await page.$('#start');
        if (startBtn) {
            await startBtn.click();
        }

        await statusMessage.edit('✅ Server is starting up!');
    } catch (err) {
        console.error('Error starting Aternos server:', err);
        if (statusMessage) await statusMessage.edit('❌ Failed to start Aternos server.');
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
