import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DATA_FILE = join(DATA_DIR, 'data.json');
const PROMPT_FILE = join(__dirname, 'prompt.txt');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY environment variable required');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

function parseTrendingPage(html) {
  const $ = cheerio.load(html);
  const items = [];
  $('article').each((i, article) => {
    const $a = $(article);
    const nameHref = $a.find('h2 a').attr('href');
    const fullName = nameHref ? nameHref.replace(/^\//, '') : '';
    const name = fullName.split('/')[1] || fullName;
    const description = $a.find('p').text().trim();
    const metaText = $a.find('.mt-2').text().trim().replace(/\s+/g, ' ');
    const langMatch = metaText.match(/^([A-Za-z#+.\s]+?)\s+[\d,]/);
    const language = langMatch ? langMatch[1].trim() : '';
    const totalStars = $a.find('a[href$="/stargazers"]').text().trim().replace(/,/g, '');
    const forks = $a.find('a[href$="/forks"]').text().trim().replace(/,/g, '');
    const todayMatch = metaText.match(/([\d,]+)\s+stars\s+today/);
    const starsToday = todayMatch ? todayMatch[1].replace(/,/g, '') : '0';
    items.push({
      rank: i + 1,
      name,
      fullName,
      description,
      language,
      stars: parseInt(totalStars) || 0,
      starsToday: parseInt(starsToday) || 0,
      forks: parseInt(forks) || 0,
    });
  });
  return items;
}

async function fetchTrending(since) {
  const url = `https://github.com/trending?since=${since}`;
  console.log(`Fetching ${url}...`);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error(`Failed to fetch trending: ${res.status}`);
  const html = await res.text();
  return parseTrendingPage(html);
}

async function fetchReadme(fullName) {
  const url = `https://api.github.com/repos/${fullName}/readme`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.raw+json',
      'User-Agent': 'github-daily-trending/1.0',
    },
  });
  if (!res.ok) return '';
  const text = await res.text();
  return text.slice(0, 8000);
}

async function generateAnalysis(fullName, description, stars, language, readme) {
  const promptTemplate = readFileSync(PROMPT_FILE, 'utf-8');
  const prompt = promptTemplate
    .replace('{fullName}', fullName)
    .replace('{description}', description)
    .replace('{stars}', String(stars))
    .replace('{language}', language || 'Unknown')
    .replace('{readme}', readme);

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const sections = {};
  const sectionNames = [
    'CORE IDEA', 'ENGINEERING METHOD', 'WHY IT MATTERS',
    'AUDIENCE', 'DIFFICULTY', 'QUICK START', 'WHY IT IS HOT', 'USE CASE',
  ];
  const joined = sectionNames.join('|');
  for (const name of sectionNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`${escaped}:\\s*(.+?)(?=\\n\\s*(?:${joined})\\s*:|$)`, 's');
    const match = text.match(pattern);
    sections[name] = match ? match[1].trim() : '';
  }

  return {
    coreIdea: sections['CORE IDEA'],
    engineeringMethod: sections['ENGINEERING METHOD'],
    whyItMatters: sections['WHY IT MATTERS'],
    audience: sections['AUDIENCE'],
    difficulty: sections['DIFFICULTY'],
    quickStart: sections['QUICK START'],
    whyItIsHot: sections['WHY IT IS HOT'],
    useCase: sections['USE CASE'],
  };
}

async function computeWeeklyAppearances(dailyItems, existingData) {
  const appearances = {};
  for (const item of dailyItems) {
    let count = 0;
    const dates = Object.keys(existingData || {}).sort().reverse().slice(0, 7);
    for (const d of dates) {
      const dayItems = existingData[d]?.ranges?.daily || [];
      if (dayItems.some(i => i.fullName === item.fullName)) count++;
    }
    appearances[item.fullName] = count + 1;
  }
  return appearances;
}

async function main() {
  const [daily, weekly, monthly] = await Promise.all([
    fetchTrending('daily'),
    fetchTrending('weekly'),
    fetchTrending('monthly'),
  ]);

  console.log(`Daily: ${daily.length}, Weekly: ${weekly.length}, Monthly: ${monthly.length}`);

  const existingData = existsSync(DATA_FILE)
    ? JSON.parse(readFileSync(DATA_FILE, 'utf-8'))
    : {};

  const today = new Date().toISOString().slice(0, 10);
  const appearances = await computeWeeklyAppearances(daily, existingData);

  const itemsWithAnalysis = [];
  for (const item of daily.slice(0, 10)) {
    console.log(`Processing ${item.fullName}...`);
    let analysis = null;
    try {
      const readme = await fetchReadme(item.fullName);
      if (readme) {
        analysis = await generateAnalysis(
          item.fullName, item.description, item.stars, item.language, readme
        );
      }
    } catch (err) {
      console.warn(`Failed analysis for ${item.fullName}: ${err.message}`);
    }
    itemsWithAnalysis.push({
      ...item,
      starsRange: item.starsToday,
      analysis,
      weeklyAppearances: appearances[item.fullName] || 1,
    });
  }

  function mapToOutput(items, rangeStars) {
    return items.slice(0, 10).map((item, i) => ({
      rank: i + 1,
      name: item.name,
      fullName: item.fullName,
      description: item.description,
      language: item.language,
      stars: item.stars,
      starsRange: rangeStars === 'starsToday' ? item.starsToday : item.starsToday,
      forks: item.forks,
      analysis: null,
      weeklyAppearances: 0,
    }));
  }

  const snapshot = {
    date: today,
    generatedAt: new Date().toISOString(),
    ranges: {
      daily: itemsWithAnalysis,
      weekly: mapToOutput(weekly, 'starsToday'),
      monthly: mapToOutput(monthly, 'starsToday'),
    },
  };

  existingData[today] = snapshot;
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(existingData, null, 2));
  console.log(`Data written to ${DATA_FILE} (${today})`);
}

main().catch(err => { console.error(err); process.exit(1); });
