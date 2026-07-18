import { existsSync, readFileSync, writeFileSync } from 'fs';

const GITHUB_API = 'https://api.github.com';
const HEADERS = {
  'Accept': 'application/vnd.github.v3+json',
  'User-Agent': 'github-daily-trending/1.0',
};

const LANGUAGE_TAGS = {
  python: ['Python', 'Django', 'Flask', 'PyTorch', 'TensorFlow', 'Jupyter'],
  javascript: ['JavaScript', 'TypeScript', 'Node.js', 'React', 'Vue', 'Svelte'],
  rust: ['Rust', 'Cargo'],
  go: ['Go', 'Golang'],
  java: ['Java', 'Kotlin', 'Spring'],
  cpp: ['C++', 'Cpp'],
};

function detectTechStack(language, description, readme, topics) {
  const text = [description, readme, ...(topics || [])].filter(Boolean).join(' ').toLowerCase();
  const stack = [];
  for (const [tech, keywords] of Object.entries(LANGUAGE_TAGS)) {
    if (keywords.some(k => text.includes(k.toLowerCase()))) stack.push(tech);
  }
  if (language) stack.push(language.toLowerCase());
  return [...new Set(stack)];
}

function detectCategory(fullName, description, topics) {
  const desc = (description || '').toLowerCase();
  const allTopics = (topics || []).join(' ').toLowerCase();
  const combined = desc + ' ' + allTopics;

  if (/ai|machine learning|deep learning|llm|gpt|neural|transformer|model/.test(combined)) return 'ai-ml';
  if (/framework|library|sdk|api|toolkit/.test(combined)) return 'framework';
  if (/database|storage|sql|nosql|redis|kafka/.test(combined)) return 'database';
  if (/cli|command line|terminal/.test(combined)) return 'cli-tool';
  if (/web|app|application|platform|dashboard/.test(combined)) return 'application';
  if (/devops|deploy|docker|kubernetes|ci|cd/.test(combined)) return 'devops';
  if (/test|testing|qa|quality/.test(combined)) return 'testing';
  if (/security|vulnerability|hack|exploit/.test(combined)) return 'security';
  if (/visualization|chart|graph|plot/.test(combined)) return 'visualization';
  if (/mobile|android|ios|flutter|swift/.test(combined)) return 'mobile';
  if (/game|gaming|engine/.test(combined)) return 'gaming';
  if (/learn|tutorial|guide|course|book|education/.test(combined)) return 'educational';
  return 'other';
}

function extractTopics(repoData) {
  return repoData.topics || [];
}

function extractFirstParagraph(readme) {
  if (!readme) return '';
  const lines = readme.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  for (const line of lines) {
    const clean = line.replace(/[#*_`[\]()>|~-]/g, '').trim();
    if (clean.length > 30 && clean.length < 500) return clean;
  }
  return '';
}

function extractInstallCmd(readme, language) {
  if (!readme) return '';
  const lines = readme.split('\n');

  // Look for code blocks with install commands
  let inCodeBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (!inCodeBlock) {
      const lower = line.toLowerCase();
      if (/^(npm|pip|cargo|go get|brew|apt|yarn|pnpm)\s/.test(lower)) {
        return line;
      }
    }
  }

  // Fallback by language
  if (/python/i.test(language)) return 'pip install ' + 'TODO';
  if (/javascript|typescript|node/i.test(language)) return 'npm install ' + 'TODO';
  if (/rust/i.test(language)) return 'cargo install ' + 'TODO';
  if (/go/i.test(language)) return 'go get ' + 'TODO';
  return '';
}

function detectDifficulty(stars, description, readme) {
  const text = [description, readme].filter(Boolean).join(' ').toLowerCase();

  if (/beginner|入门|初学者|getting started|quick start|tutorial/.test(text)) return 'beginner';
  if (/advanced|expert|professional|production|enterprise/.test(text)) return 'advanced';
  if (stars > 50000) return 'intermediate';
  if (stars > 10000) return 'intermediate';
  return 'intermediate'; // default
}

function detectAudience(description, topics, language) {
  const desc = (description || '').toLowerCase();
  const allTopics = (topics || []).join(' ').toLowerCase();

  if (/developer|engineer|programmer|coder/.test(desc)) return '开发者、软件工程师';
  if (/data scientist|data engineer|data analyst/.test(desc)) return '数据科学家、数据分析师';
  if (/designer|ui|ux/.test(desc)) return '设计师、前端开发者';
  if (/researcher|scientist|academic/.test(desc)) return '研究人员、学者';
  if (/student|learner|beginner/.test(desc)) return '学生、初学者';
  if (/devops|admin|sysadmin|operator/.test(desc)) return 'DevOps 工程师、运维人员';

  if (/python/i.test(language)) return 'Python 开发者、数据工程师';
  if (/javascript|typescript/i.test(language)) return '前端开发者、全栈工程师';
  if (/rust/i.test(language)) return '系统开发者、性能敏感场景工程师';
  if (/go/i.test(language)) return '后端开发者、云原生工程师';
  if (/java/i.test(language)) return 'Java 开发者、企业应用工程师';
  if (/kotlin/i.test(language)) return 'Android 开发者、Kotlin 开发者';

  return '软件开发者、技术爱好者';
}

function generateCoreIdea(fullName, description, firstParagraph, category) {
  if (firstParagraph && firstParagraph.length > 40) return firstParagraph;
  if (description) return description;
  const name = fullName.split('/')[1] || fullName;
  return `${name} 是一个开源项目，旨在解决开发者在日常工作中遇到的痛点问题。`;
}

function generateEngineeringMethod(description, topics, language, readme) {
  const text = [description, readme].filter(Boolean).join(' ').toLowerCase();

  if (/microservice|microservice|grpc|service/.test(text)) return '采用微服务架构设计，模块间通过 gRPC/HTTP 协议通信，支持水平扩展和独立部署。';
  if (/plugin|extension|modular/.test(text)) return '采用插件化架构，核心功能通过模块化设计实现扩展，用户可以根据需要加载功能模块。';
  if (/pipeline|workflow|stream/.test(text)) return '基于管道架构设计，数据处理流程清晰可追溯，支持自定义组件和中间处理环节。';
  if (/graph|network|node|edge/.test(text)) return '采用图计算模型，通过节点和边的数据结构表达复杂关系，支持高效的图遍历和查询。';
  if (/agent|autonomous|intelligent/.test(text)) return '采用 Agent 架构，通过感知-决策-执行循环实现自主工作，支持多 Agent 协同。';

  if (language) {
    const lang = language.toLowerCase();
    if (/python/i.test(lang)) return '使用 Python 构建，充分利用异步编程和类型注解提升代码质量和运行效率。';
    if (/javascript|typescript/i.test(lang)) return '使用 TypeScript 构建，利用静态类型系统和现代 ECMAScript 特性保证代码质量和开发效率。';
    if (/rust/i.test(lang)) return '使用 Rust 构建，利用所有权系统和零成本抽象保证内存安全和极致性能。';
    if (/go/i.test(lang)) return '使用 Go 构建，利用 goroutine 和 channel 实现高并发处理，编译为单一二进制方便部署。';
  }

  return '采用模块化架构设计，注重代码可维护性和可扩展性，遵循行业最佳实践。';
}

function generateWhyItMatters(description, category, stars, readme) {
  const text = [description, readme].filter(Boolean).join(' ').toLowerCase();

  if (/performance|fast|speed|optimize|efficient/.test(text)) return '该项目的核心价值在于显著的性能提升，解决现有方案在大规模场景下的效率瓶颈。';
  if (/simple|easy|lightweight|minimal|user.friendly/.test(text)) return '该项目以简洁易用为核心设计理念，大幅降低上手门槛，让更多开发者能快速使用。';
  if (/scale|distributed|large|big|enterprise/.test(text)) return '该项目专注于大规模场景下的可靠性，为企业和团队提供了可扩展的解决方案。';
  if (/learn|education|tutorial|course/.test(text)) return '该项目将复杂概念以实践方式呈现，是开发者系统学习和深入理解该领域的宝贵资源。';

  if (category === 'ai-ml') return 'AI 正在重塑各行各业，该项目为开发者提供了实用的 AI 工具和基础设施，降低了 AI 应用开发门槛。';
  if (category === 'framework') return '好的框架能十倍提升开发效率，该项目在同类工具中提供了更优的抽象和更好的开发者体验。';
  if (category === 'educational') return '该项目是学习该技术的优秀实践资源，通过动手构建让开发者真正理解核心技术原理。';
  if (category === 'cli-tool') return '命令行工具是开发者日常效率的基石，该项目提供更优秀的终端体验。';

  if (stars > 10000) return '该仓库拥有 10K+ Star，说明已经被大量开发者认可并在生产环境中广泛使用。';
  if (stars > 5000) return '该仓库拥有 5K+ Star，证明其价值已获得社区广泛认可，是经过实践检验的优秀项目。';

  return '该项目精准切中了开发者的实际需求，解决了现有工作流程中的关键痛点。';
}

function generateWhyItIsHot(stars, starsToday, description, category) {
  const text = (description || '').toLowerCase();

  if (starsToday > 3000) return `今日新增 ${starsToday}+ Star，增长极为迅猛！项目处于爆发期，社区关注度极高。`;
  if (starsToday > 1500) return `今日新增 ${starsToday}+ Star，增长势头强劲。项目正获得越来越多开发者的关注。`;
  if (starsToday > 500) return `今日新增 ${starsToday}+ Star，社区讨论热度持续攀升，值得关注。`;
  if (starsToday > 100) return `今日新增 ${starsToday}+ Star，正逐渐获得社区认可和关注。`;

  if (category === 'ai-ml') return 'AI 领域的创新永不停歇，该项目代表了该方向的最新进展。';
  if (category === 'educational') return '优质的学习资源永远是刚需，该项目填补了该领域系统性学习资源的空白。';

  return '该项目凭借独特的价值主张和优秀的设计，在 GitHub 社区获得持续关注。';
}

function generateUseCase(description, category, fullName, firstParagraph) {
  const text = [description, firstParagraph].filter(Boolean).join(' ').toLowerCase();
  const name = fullName.split('/')[1] || fullName;

  if (/chatbot|chat|conversation/.test(text)) return `企业使用 ${name} 构建智能客服系统，大幅降低人工客服成本并提升响应速度。`;
  if (/code|program|develop/.test(text)) return `开发团队将 ${name} 集成到 CI/CD 流程中，自动化代码质量检查流程。`;
  if (/data|analysis|analytics/.test(text)) return `数据分析团队使用 ${name} 处理每日 TB 级数据，显著缩短数据处理流水线时间。`;
  if (/learn|education|course/.test(text)) return `学习者通过 ${name} 系统掌握该领域核心知识，将理论付诸实践。`;
  if (/monitor|observability|log/.test(text)) return `运维团队使用 ${name} 搭建分布式系统监控，实时发现和定位生产环境问题。`;
  if (/deploy|devops|ci/.test(text)) return `工程团队将 ${name} 集成到 CI/CD 流水线，实现自动化部署和持续集成。`;
  if (/model|ml|ai|train/.test(text)) return `AI 团队使用 ${name} 构建和部署机器学习模型，加速从实验到生产的迭代周期。`;
  if (/search|search|index/.test(text)) return `产品团队使用 ${name} 构建全文搜索引擎，为用户提供毫秒级搜索结果。`;
  if (/test|testing|qa/.test(text)) return `QA 团队使用 ${name} 自动化测试流程，将回归测试时间从小时级缩短到分钟级。`;

  if (category === 'cli-tool') return `开发者日常使用 ${name} 命令行工具，将重复性工作简化为一键操作。`;
  if (category === 'framework') return `开发团队基于 ${name} 构建企业级应用，享受成熟的生态和社区支持。`;
  if (category === 'ai-ml') return `研究团队使用 ${name} 加速实验迭代，在更短时间内验证新的 AI 算法。`;

  return `开发团队使用 ${name} 优化日常工作流程，提升开发和运维效率。`;
}

function generateQuickStart(fullName, language, readme) {
  const name = fullName.split('/')[1] || fullName;
  const readmeLower = (readme || '').toLowerCase();

  const installPatterns = [
    /npm\s+(install|i|create|init)\s+\S+/,
    /pip\s+(install)\s+\S+/,
    /cargo\s+(install)\s+\S+/,
    /go\s+(install|get)\s+\S+/,
    /yarn\s+(add|create)\s+\S+/,
    /pnpm\s+(add|install)\s+\S+/,
    /brew\s+(install)\s+\S+/,
    /npx\s+\S+/,
    /apt\s+(install)\s+\S+/,
  ];

  for (const pattern of installPatterns) {
    const match = readmeLower.match(pattern);
    if (match) return match[0];
  }

  if (/python/i.test(language)) return `pip install ${name.toLowerCase()}`;
  if (/javascript|typescript|node/i.test(language)) return `npm install ${name.toLowerCase()}`;
  if (/rust/i.test(language)) return `cargo install ${name.toLowerCase()}`;
  if (/go/i.test(language)) return `go install ${name.toLowerCase()}`;
  if (/java|kotlin/i.test(language)) return `在 build.gradle 中添加依赖后同步项目。`;
  if (/dart|flutter/i.test(language)) return `flutter pub add ${name.toLowerCase()}`;
  if (/swift/i.test(language)) return `在 Package.swift 中添加依赖后运行 swift build。`;

  return `克隆仓库，按 README 指引完成配置和运行。`;
}

function computeAppearances(dailyItems, existingData) {
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

function mapToOutput(items) {
  return items.slice(0, 10).map((item, i) => ({
    rank: i + 1,
    name: item.name,
    fullName: item.fullName,
    description: item.description,
    language: item.language || '',
    stars: item.stars,
    starsRange: item.starsToday,
    forks: item.forks,
    analysis: item.analysis || null,
    weeklyAppearances: item.weeklyAppearances || 1,
  }));
}

async function fetchRepoInfo(fullName) {
  const url = `${GITHUB_API}/repos/${fullName}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;
  return res.json();
}

async function fetchReadme(fullName) {
  const url = `${GITHUB_API}/repos/${fullName}/readme`;
  const res = await fetch(url, {
    headers: { ...HEADERS, Accept: 'application/vnd.github.raw+json' },
  });
  if (!res.ok) return '';
  const text = await res.text();
  return text.slice(0, 6000);
}

function generateAnalysisFromData(fullName, description, language, stars, starsToday, repoInfo, readmeContent) {
  const topics = repoInfo ? extractTopics(repoInfo) : [];
  const firstParagraph = extractFirstParagraph(readmeContent);
  const category = detectCategory(fullName, description, topics);
  const techStack = detectTechStack(language, description, readmeContent, topics);
  const difficulty = detectDifficulty(stars, description, readmeContent);
  const audience = detectAudience(description, topics, language);

  return {
    coreIdea: generateCoreIdea(fullName, description, firstParagraph, category),
    engineeringMethod: generateEngineeringMethod(description, topics, language, readmeContent),
    whyItMatters: generateWhyItMatters(description, category, stars, readmeContent),
    audience,
    difficulty,
    quickStart: generateQuickStart(fullName, language, readmeContent),
    whyItIsHot: generateWhyItIsHot(stars, starsToday, description, category),
    useCase: generateUseCase(description, category, fullName, firstParagraph),
    _meta: { category, techStack, topics, firstParagraph },
  };
}

export async function enrichWithAnalysis(dailyItems, existingData) {
  const appearances = computeAppearances(dailyItems, existingData);

  const itemsWithAnalysis = [];
  for (const [i, item] of dailyItems.entries()) {
    process.stdout.write(`  ${item.fullName}... `);
    let analysis = null;
    try {
      const [repoInfo, readmeContent] = await Promise.all([
        fetchRepoInfo(item.fullName).catch(() => null),
        fetchReadme(item.fullName).catch(() => ''),
      ]);
      analysis = generateAnalysisFromData(
        item.fullName, item.description, item.language,
        item.stars, item.starsToday, repoInfo, readmeContent
      );
      console.log('OK');
    } catch (err) {
      console.log('FAIL:', err.message);
    }

    itemsWithAnalysis.push({
      rank: i + 1,
      name: item.name,
      fullName: item.fullName,
      description: item.description,
      language: item.language || '',
      stars: item.stars,
      starsRange: item.starsToday,
      forks: item.forks,
      analysis,
      weeklyAppearances: appearances[item.fullName] || 1,
    });
  }

  return itemsWithAnalysis;
}

export { mapToOutput };
