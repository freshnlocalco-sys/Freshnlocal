console.log("Estimated token savings per Recipe generation request:");
const catalogSize = 350; // typical catalog size
const avgItemLength = 20;
const charsToTokens = 4; // approx 4 chars per token

const tokensBefore = (catalogSize * avgItemLength) / charsToTokens;
const tokensAfter = (15 * avgItemLength) / charsToTokens;

console.log(`Before: ~${Math.round(tokensBefore)} tokens for catalog context`);
console.log(`After: ~${Math.round(tokensAfter)} tokens for catalog context`);
console.log(`Reduction: ${Math.round((1 - tokensAfter/tokensBefore)*100)}% decrease in prompt size per request.`);
