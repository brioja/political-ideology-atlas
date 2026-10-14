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

// Plain-language explanations for each statement (copied from statements.json).
const QUESTION_HELP = {
 "universal-healthcare": {
  "agree": "Everyone gets health care paid for or guaranteed by the state, usually through taxes.",
  "disagree": "Health care is mainly bought privately or through insurance, with the state covering less.",
  "note": "About how far the state should guarantee basic services."
 },
 "raise-minimum-wage": {
  "agree": "The legal lowest wage goes up a lot, even if some employers have to pay more.",
  "disagree": "Wages are left mostly to employers, workers and unions, or raised only slowly.",
  "note": "About how much the state should set pay."
 },
 "markets-allocate-better": {
  "agree": "Prices and competition generally decide better than officials what gets made and who gets it.",
  "disagree": "Governments or public planning often decide better than markets what society needs.",
  "note": "A core economic question: markets or the state."
 },
 "public-ownership": {
  "agree": "Key industries are run by the state or public bodies instead of private companies.",
  "disagree": "Those industries stay mostly in private hands, perhaps with regulation.",
  "note": "About who owns the commanding heights of the economy."
 },
 "tax-the-wealthy": {
  "agree": "High earners and the very rich pay a noticeably larger share in tax.",
  "disagree": "Taxes on the wealthy stay as they are or go down.",
  "note": "About redistribution through taxes."
 },
 "unions-good": {
  "agree": "Workers organizing collectively improves pay, conditions and fairness overall.",
  "disagree": "Unions mostly protect insiders, raise costs or hold back the economy.",
  "note": "About organized labor's role."
 },
 "property-fundamental": {
  "agree": "Owners' rights to their property should almost never be overridden, even for public goals.",
  "disagree": "Property can be limited, taxed or redistributed when the community needs it.",
  "note": "About how absolute property rights are."
 },
 "regulate-corporations": {
  "agree": "Companies face more rules on things like pollution, prices, labor and competition.",
  "disagree": "Companies face fewer rules, or the current amount is enough.",
  "note": "About the state's oversight of business."
 },
 "cut-welfare": {
  "agree": "Benefits often discourage work and should be reduced.",
  "disagree": "Welfare is a safety net worth keeping or expanding.",
  "note": "About the size of the welfare state."
 },
 "worker-ownership": {
  "agree": "Businesses should belong to the people who work in them, for example as cooperatives.",
  "disagree": "Businesses can be owned by investors, founders or the state as they are now.",
  "note": "About who owns workplaces."
 },
 "surveillance-ok": {
  "agree": "Security agencies may monitor communications if it helps stop attacks.",
  "disagree": "Privacy should be protected even if it makes security work harder.",
  "note": "About security versus civil liberties."
 },
 "legalize-drugs": {
  "agree": "Adults may legally buy and use drugs such as cannabis, possibly with regulation.",
  "disagree": "Recreational drugs stay illegal.",
  "note": "About personal freedom versus protection from harm."
 },
 "restrict-hate-speech": {
  "agree": "Speech that attacks groups for who they are can be punished by law.",
  "disagree": "Offensive speech stays legal; it is answered with more speech, not law.",
  "note": "About limits on free speech."
 },
 "strong-leader": {
  "agree": "A decisive leader who can act without parliament or courts slowing things down would help.",
  "disagree": "Checks and balances matter even when they slow decisions down.",
  "note": "About concentrated versus limited power."
 },
 "state-harmful": {
  "agree": "Society would be better off without governments at all.",
  "disagree": "Some form of state is needed, whatever its size.",
  "note": "Separates anarchists from everyone else."
 },
 "limit-guns": {
  "agree": "Owning guns requires strict licensing, or most private gun ownership is banned.",
  "disagree": "Adults should be able to own guns with few restrictions.",
  "note": "About gun rights versus gun control."
 },
 "empower-police-military": {
  "agree": "Police and armed forces get bigger budgets and more powers.",
  "disagree": "Police and military budgets and powers stay the same or shrink.",
  "note": "About security institutions."
 },
 "legalize-sex-work": {
  "agree": "Adults can legally sell sexual services, ideally with rules for safety.",
  "disagree": "Selling or buying sex should be banned or discouraged by law.",
  "note": "About personal freedom, morality and exploitation."
 },
 "decide-locally": {
  "agree": "Towns and regions make most decisions rather than the national government.",
  "disagree": "National government sets common rules so the same standards apply everywhere.",
  "note": "About decentralization."
 },
 "rehabilitation": {
  "agree": "Prisons mainly try to help offenders change and return to society.",
  "disagree": "Prisons mainly exist to punish and to protect the public.",
  "note": "About the purpose of criminal justice."
 },
 "traditional-family": {
  "agree": "A married mother and father raising children is the model society should support.",
  "disagree": "Many family forms are equally valid and none should be favored.",
  "note": "About social traditionalism."
 },
 "same-sex-marriage": {
  "agree": "Same-sex couples can marry with the same rights as anyone else.",
  "disagree": "Marriage should be only between a man and a woman.",
  "note": "About LGBT equality and tradition."
 },
 "abortion-legal": {
  "agree": "Women can legally choose to end most pregnancies.",
  "disagree": "Abortion should be banned or allowed only in rare cases.",
  "note": "About reproductive rights and the status of the unborn."
 },
 "more-religion-public": {
  "agree": "Religious values and institutions should shape laws, schools and public life more.",
  "disagree": "Religion should stay a private matter, out of government.",
  "note": "About religion in public life."
 },
 "correct-racial-injustice": {
  "agree": "Society should take active steps, such as targeted programs, to repair past discrimination.",
  "disagree": "Government should treat everyone the same now, without remedies for the past.",
  "note": "About how to deal with historical racism."
 },
 "gender-social-construct": {
  "agree": "Ideas of what men and women are like come mostly from culture, not biology.",
  "disagree": "Differences between men and women are mostly natural or biological.",
  "note": "About gender and tradition."
 },
 "preserve-national-culture": {
  "agree": "Protecting the nation's language, customs and heritage matters.",
  "disagree": "Culture should change freely; preserving it is not a political goal.",
  "note": "About national identity."
 },
 "gradual-change": {
  "agree": "Reform should be slow and build on existing institutions.",
  "disagree": "Big, fast changes are sometimes needed even if institutions are disrupted.",
  "note": "About the pace of change: conservative or radical."
 },
 "reduce-immigration": {
  "agree": "Fewer people should be allowed to move into the country.",
  "disagree": "Immigration should stay at current levels or increase.",
  "note": "About immigration."
 },
 "empower-international-orgs": {
  "agree": "Bodies like the UN should be able to make more binding decisions over countries.",
  "disagree": "Nations should keep decisions in their own hands.",
  "note": "About global governance versus sovereignty."
 },
 "free-trade": {
  "agree": "Fewer tariffs and trade barriers make all countries better off over time.",
  "disagree": "Free trade hurts some workers or countries badly, so trade should be managed.",
  "note": "About globalization."
 },
 "nation-first": {
  "agree": "Your country's own interests come before international agreements.",
  "disagree": "Cooperation with other countries usually comes first.",
  "note": "About nationalism versus internationalism."
 },
 "humanitarian-intervention": {
  "agree": "Using force abroad can be right to stop mass atrocities.",
  "disagree": "Military intervention in other countries is wrong or does more harm than good.",
  "note": "About foreign policy."
 },
 "open-borders": {
  "agree": "In the long run people should be free to live and work in any country.",
  "disagree": "Countries should always control who can enter.",
  "note": "About borders as such."
 },
 "limit-growth": {
  "agree": "Protecting nature can mean accepting less economic growth.",
  "disagree": "Growth should continue; environmental problems can be solved alongside it.",
  "note": "About growth versus ecology."
 },
 "drastic-climate-action": {
  "agree": "Governments should act fast and hard on emissions, even at real cost.",
  "disagree": "Climate policy should be modest, market-led, or not a priority.",
  "note": "About climate change."
 },
 "tech-solves-problems": {
  "agree": "Science and technology will fix most of what goes wrong for people.",
  "disagree": "Technology can't solve problems that are social, moral or political.",
  "note": "About optimism about technology."
 },
 "expand-nuclear": {
  "agree": "Build more nuclear power plants.",
  "disagree": "Phase out or avoid nuclear power.",
  "note": "About energy policy; splits even environmentalists."
 },
 "revolution-justified": {
  "agree": "Overthrowing a government by force can sometimes be right.",
  "disagree": "Change should only come through legal, peaceful means.",
  "note": "About revolution versus reform."
 },
 "experts-over-public": {
  "agree": "Specialists should have more weight in decisions than public opinion.",
  "disagree": "Ordinary people should have the final say, even against expert advice.",
  "note": "About technocracy versus democracy."
 }
};
for (const q of QUESTIONS) Object.assign(q, QUESTION_HELP[q.id]);

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
