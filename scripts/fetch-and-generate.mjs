import { writeFileSync, existsSync, readFileSync } from 'fs';
import * as cheerio from 'cheerio';
import { enrichWithAnalysis, mapToOutput } from './generate-analysis.mjs';

const DATA_FILE = 'data/data.json';

async function fetchTrending(since) {
  const url = `https://github.com/trending?since=${since}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error(`Failed to fetch trending: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const articles = $('article');
  const items = [];
  articles.each((i, el) => {
    const $el = $(el);
    const fullName = $el.find('h2 a').attr('href')?.slice(1)?.trim() || '';
    const name = fullName.split('/')[1] || '';
    if (!name) return;

    const descEl = $el.find('p');
    descEl.find('svg, svg *').remove();
    const description = descEl.text().trim();

    const lang = $el.find('[itemprop="programmingLanguage"]').text().trim();
    const stars = parseInt($el.find('.d-inline-block.float-sm-right').first().text().trim().replace(/,/g, '')) || 0;
    const forks = parseInt($el.find('.d-inline-block.float-sm-right').last().text().trim().replace(/,/g, '')) || 0;

    const starsTodayText = $el.find('.float-sm-left').last().text().trim();
    const starsToday = parseInt(starsTodayText.replace(/[,+]/g, '')) || 0;

    items.push({ fullName, name, description, language: lang, stars, forks, starsToday, starsTodayText });
  });

  return items;
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

  console.log('\nEnriching daily items with analysis...');
  const dailyWithAnalysis = await enrichWithAnalysis(daily, existingData);

  const today = new Date().toISOString().slice(0, 10);
  const snapshot = {
    date: today,
    generatedAt: new Date().toISOString(),
    ranges: {
      daily: dailyWithAnalysis,
      weekly: mapToOutput(weekly),
      monthly: mapToOutput(monthly),
    },
  };

  existingData[today] = snapshot;
  writeFileSync(DATA_FILE, JSON.stringify(existingData, null, 2));
  console.log(`\nDone! ${today}: ${dailyWithAnalysis.length} items with analysis`);
}

main().catch(err => { console.error(err); process.exit(1); });
