// TEMPORARY hand-written profiles for the original 40 statements. scripts/build.js replaces this
// file with audited profiles once audits/profiles has enough of them.
//
// Each ideology is written as its expected answer to every question, in order.
// Codes: S = strongly agree (+2), a = agree (+1), . = neutral (0),
//        d = disagree (-1), X = strongly disagree (-2).
// Spaces and | are ignored; they only group the string by section for readability.

const QUESTION_TEXTS = [
  // Economics (1-10)
  "The government should provide universal healthcare.",
  "The minimum wage should be raised substantially.",
  "Free markets allocate resources better than governments do.",
  "Major industries like energy, rail and utilities should be publicly owned.",
  "Taxes on the wealthy should be significantly higher.",
  "Labor unions are good for workers and for society.",
  "Private property is a fundamental right that should be very hard to override.",
  "Corporations should be more tightly regulated.",
  "Welfare programs create dependency and should be cut.",
  "Workers should collectively own the businesses they work in.",
  // Liberty and authority (11-20)
  "Government surveillance is acceptable if it prevents terrorism.",
  "Recreational drugs should be legal for adults.",
  "Hate speech should be legally restricted.",
  "A strong leader who can bypass political gridlock would benefit the country.",
  "The state itself is unnecessary and harmful.",
  "Gun ownership should be strictly limited.",
  "The police and military need more funding and authority.",
  "Sex work between consenting adults should be legal.",
  "Decisions should be made as locally as possible rather than by national government.",
  "Prisons should focus on rehabilitation rather than punishment.",
  // Society and culture (21-28)
  "Traditional family structures are the foundation of a healthy society.",
  "Same-sex marriage should be legal.",
  "Abortion should be legal in most cases.",
  "Religion should play a larger role in public life.",
  "Society should actively work to correct historical racial injustices.",
  "Gender is primarily a social construct.",
  "Preserving national culture and traditions is important.",
  "Social change should be gradual and respect established institutions.",
  // Nation and world (29-34)
  "Immigration levels should be reduced.",
  "International organizations like the UN should have more power.",
  "Free trade benefits everyone in the long run.",
  "My country should put its own interests ahead of global cooperation.",
  "Military intervention abroad is sometimes necessary to protect human rights.",
  "National borders should eventually be open.",
  // Ecology and technology (35-38)
  "Economic growth should be limited to protect the environment.",
  "Climate change requires drastic government action.",
  "Technological progress will solve most of humanity's problems.",
  "Nuclear power should be expanded.",
  // Means of change (39-40)
  "Revolution is sometimes justified to achieve political change.",
  "Experts should have more say in policy than the general public.",
];

const QUESTION_IDS = ["universal-healthcare", "raise-minimum-wage", "markets-allocate-better", "public-ownership", "tax-the-wealthy", "unions-good", "property-fundamental", "regulate-corporations", "cut-welfare", "worker-ownership", "surveillance-ok", "legalize-drugs", "restrict-hate-speech", "strong-leader", "state-harmful", "limit-guns", "empower-police-military", "legalize-sex-work", "decide-locally", "rehabilitation", "traditional-family", "same-sex-marriage", "abortion-legal", "more-religion-public", "correct-racial-injustice", "gender-social-construct", "preserve-national-culture", "gradual-change", "reduce-immigration", "empower-international-orgs", "free-trade", "nation-first", "humanitarian-intervention", "open-borders", "limit-growth", "drastic-climate-action", "tech-solves-problems", "expand-nuclear", "revolution-justified", "experts-over-public"];
const QUESTIONS = QUESTION_TEXTS.map((text, i) => ({ id: QUESTION_IDS[i], text }));

const IDEOLOGY_SOURCE = {
  //                          econ 1-10    liberty 11-20  society 21-28  world 29-34  eco 35-38  means
  "Marxist-Leninist":        "SSXSS aXSXa | adSSX aadda | ..aXa ..X | .dXaX. | daSS | Sa",
  "Anarcho-Communist":       "SaXSS SXSXS | XS.XS dXSSS | XSSXS SXX | XddXXS | aa.. | SX",
  "Democratic Socialist":    "SSdSS SdSXS | daaXd adaaS | dSSdS add | daddaa | aS.. | .d",
  "Social Democrat":         "SS.aS S.SXa | .aaXX S.a.S | .SSda a.a | daada. | .Sa. | Xa",
  "Eco-Socialist":           "SSdaS SdSXS | daaXd adaSS | dSSdS add | dXddaa | SSXX | .a",
  "Progressive Liberal":     "SS.dS a.SX. | daaXX SdaS. | dSSXS ad. | XaaXaa | .Sa. | Xa",
  "Left Populist":           "SSXaS SdSXa | d..aX ...aa | .aa.a .ad | aXXaXd | .a.. | aX",
  "Centrist":                "aaad a.aa.. | ...dX a...a | aaad. .aS | ..a.ad | daaa | Xa",
  "Technocrat":              "a.a.a ..S.. | SdaaX Sa.Xa | .aSX. ..a | .SSda. | .SSS | XS",
  "Neoliberal":              "a.Sd. daa.d | aa.XX a.a.a | .SSda ..a | XSSXSa | XaSS | XS",
  "Classical Liberal":       "ddSXd dSda. | XaXXd ddaaa | .aadd ..a | ddSd.a | X.aa | X.",
  "Libertarian":             "XXSXX dSXS. | XSXXd XdSSa | .SaXX ... | XdSdXa | XXSS | dd",
  "Anarcho-Capitalist":      "XXSXX dSXS. | XSXXS XXSSa | .aaXX ... | XXSdXS | XXSS | aX",
  "Liberal Conservative":    ".daXd da.ad | ad.dX .a.a. | aaadd daS | a.SaaX | X.aS | Xa",
  "Christian Democrat":      "aa.da aaa.a | .XadX aaXaa | SdXS. dSS | aaa.ad | .a.. | X.",
  "Traditional Conservative":"ddaXX dSdad | aXd.X XSXad | SXXSX XSS | adaaaX | Xd.a | Xd",
  "National Conservative":   "aa.da .aaad | aXdaX XSXaX | SXXSX XSa | SXXSdX | dd.a | .X",
  "Authoritarian Nationalist":".ada. adSXd | SXSSX .SXXX | SXXaX XSd | SXXSaX | d.aS | Sd",
  "Monarchist":              "d.... XS..X | SXaSX aSX.X | SXXSX XSS | SXXS.X | a.X. | .a",
};

const SCORE = { S: 2, a: 1, ".": 0, d: -1, X: -2 };

function parseProfile(name, src) {
  const codes = src.replace(/[\s|]/g, "");
  const values = [...codes].map((c) => {
    if (!(c in SCORE)) throw new Error(`${name}: bad code '${c}'`);
    return SCORE[c];
  });
  if (values.length !== QUESTIONS.length) {
    throw new Error(`${name}: ${values.length} answers, expected ${QUESTIONS.length}`);
  }
  return values;
}

const IDEOLOGIES = Object.entries(IDEOLOGY_SOURCE).map(([name, src]) => ({
  id: name.toLowerCase().replace(/[^a-z]+/g, "-"),
  name,
  profile: parseProfile(name, src),
}));

// Short plain-language descriptions for the interim profiles above.
const SUMMARIES = {
  "Marxist-Leninist": "Communism as built in the Soviet Union and its allies. A revolutionary vanguard party takes power on behalf of the working class, owns and plans the economy, and rules as a single party until class society is abolished.",
  "Anarcho-Communist": "A stateless, classless society where land, workplaces and goods are held in common and distributed by need. Power is organized from the bottom up through voluntary federations instead of governments or markets.",
  "Democratic Socialist": "Socialism reached through elections rather than revolution. It wants to move key industries into public or worker ownership while keeping multi-party democracy and civil liberties.",
  "Social Democrat": "Capitalism kept, but tamed. A market economy runs alongside strong unions, high taxes on the wealthy and a universal welfare state, as in the Nordic countries.",
  "Eco-Socialist": "Treats capitalism's drive for endless growth as the root of the ecological crisis. It pairs socialist ownership and planning with limits on growth and a rapid shift away from fossil fuels.",
  "Progressive Liberal": "Modern center-left liberalism. It supports a regulated market, expanded social programs and climate action, and strongly backs civil rights, abortion rights, LGBT rights and racial equality.",
  "Left Populist": "Pits ordinary people against economic and political elites. It favors redistribution and public services, is skeptical of free trade and global institutions, and tends to be moderate on cultural questions.",
  "Centrist": "Prefers moderate, incremental policy and compromise across party lines. It accepts a market economy with a safety net and avoids strong positions on divisive cultural issues.",
  "Technocrat": "Wants policy made by experts and evidence rather than ideology or popular opinion. It is comfortable with strong state capacity, data-driven regulation and fast technological change.",
  "Neoliberal": "Favors free trade, open markets, privatization and fiscal discipline, alongside socially liberal views and support for international institutions. It shaped much of global economic policy from the 1980s on.",
  "Classical Liberal": "The 18th- and 19th-century liberalism of Locke, Smith and Mill. It defends individual rights, private property, free markets and limited, constitutional government.",
  "Libertarian": "Wants the state shrunk to its minimum: courts, police and defense. Adults should be free to do what they like with their bodies, money and property as long as they don't harm others.",
  "Anarcho-Capitalist": "Libertarianism taken to its end point: no state at all. Courts, policing and defense would be bought and sold on the free market like any other service.",
  "Liberal Conservative": "Mainstream center-right. It combines free-market economics and fiscal restraint with respect for tradition, strong institutions and gradual change.",
  "Christian Democrat": "Applies Christian social teaching to politics. It supports a market economy with a social conscience, strong families and communities, and cooperation between workers and employers.",
  "Traditional Conservative": "Puts tradition, religion, family and established institutions first. It distrusts rapid change and abstract plans to remake society.",
  "National Conservative": "Puts the nation and its culture at the center of politics. It wants lower immigration, protection of national industry and traditional values, and is skeptical of global institutions.",
  "Authoritarian Nationalist": "Covers fascism and related movements. The nation is the highest value, a single strong leader and party rule, and individual rights, democracy and class conflict are subordinated to national unity.",
  "Monarchist": "Holds that a hereditary monarch, usually backed by religion and tradition, is the rightful head of state. It sees continuity and social hierarchy as the basis of order.",
};
for (const ideo of IDEOLOGIES) ideo.summary = SUMMARIES[ideo.name];

// Category and Wikipedia article for the interim profiles.
const EXTRA = {
  "Marxist-Leninist": ["Radical Left", "Marxism–Leninism"],
  "Anarcho-Communist": ["Anarchist", "Anarchist_communism"],
  "Democratic Socialist": ["Left", "Democratic_socialism"],
  "Social Democrat": ["Left", "Social_democracy"],
  "Eco-Socialist": ["Left", "Eco-socialism"],
  "Progressive Liberal": ["Left", "Social_liberalism"],
  "Left Populist": ["Left", "Left-wing_populism"],
  "Centrist": ["Center", "Centrism"],
  "Technocrat": ["Center", "Technocracy"],
  "Neoliberal": ["Right", "Neoliberalism"],
  "Classical Liberal": ["Libertarian", "Classical_liberalism"],
  "Libertarian": ["Libertarian", "Libertarianism"],
  "Anarcho-Capitalist": ["Libertarian", "Anarcho-capitalism"],
  "Liberal Conservative": ["Right", "Liberal_conservatism"],
  "Christian Democrat": ["Center", "Christian_democracy"],
  "Traditional Conservative": ["Right", "Traditionalist_conservatism"],
  "National Conservative": ["Right", "National_conservatism"],
  "Authoritarian Nationalist": ["Far-Right", "Fascism"],
  "Monarchist": ["Far-Right", "Monarchism"],
};
for (const ideo of IDEOLOGIES) {
  const [category, article] = EXTRA[ideo.name];
  ideo.category = category;
  ideo.wikipedia = `https://en.wikipedia.org/wiki/${encodeURIComponent(article)}`;
  ideo.furtherReading = [];
}

if (typeof module !== "undefined") module.exports = { QUESTIONS, IDEOLOGIES, SCORE };
