// Wikidata SPARQL with fallback: each query starts at the next endpoint in turn (spreading the
// load) and moves on to the others when one is down, times out or keeps failing.
const ENDPOINTS = [
  "https://qlever.dev/api/wikidata",
  "https://query.wikidata.org/sparql", // Wikimedia's own service; queries time out after 60s there
];
// (qlever.cs.uni-freiburg.de is the same server as qlever.dev, so it is no fallback.)
const HEADERS = {
  "user-agent": "political-ideology-atlas/1.0 (https://github.com/brioja/political-ideology-atlas)",
  accept: "application/sparql-results+json",
  "content-type": "application/x-www-form-urlencoded",
};
const TIMEOUT_MS = 5 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let next = 0;
const unreachable = new Set(); // skipped for the rest of the run while another endpoint works

// Returns the result bindings.
async function sparql(query) {
  const failures = [];
  for (let k = 0; k < ENDPOINTS.length; k++) {
    const url = ENDPOINTS[(next + k) % ENDPOINTS.length];
    if (unreachable.has(url) && unreachable.size < ENDPOINTS.length) continue;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { method: "POST", headers: HEADERS, body: new URLSearchParams({ query }), signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (res.ok) {
          next = (next + k + 1) % ENDPOINTS.length;
          return (await res.json()).results.bindings;
        }
        failures.push(`${url}: ${res.status} ${(await res.text()).slice(0, 200)}`);
        if (res.status < 500 && res.status !== 429) break; // the query itself was refused; another endpoint may accept it
        await sleep(5000 * (attempt + 1));
      } catch (e) {
        failures.push(`${url}: ${e.cause?.code || e.name || e.message}`);
        unreachable.add(url);
        break; // unreachable or timed out: try the next endpoint
      }
    }
    console.warn(`SPARQL: ${failures[failures.length - 1]}; trying the next endpoint`);
  }
  throw new Error(`every SPARQL endpoint failed:\n${failures.join("\n")}`);
}

module.exports = { sparql, ENDPOINTS };
