// Questions and reference ideology profiles.
//
// Each ideology is written as its expected answer to every question, in order.
// Codes: S = strongly agree (+2), a = agree (+1), . = neutral (0),
//        d = disagree (-1), X = strongly disagree (-2).
// Spaces and | are ignored; they only group the string by section for readability.

const QUESTIONS = [
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
  name,
  profile: parseProfile(name, src),
}));

if (typeof module !== "undefined") module.exports = { QUESTIONS, IDEOLOGIES, SCORE };
