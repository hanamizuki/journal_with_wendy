const { Tiktoken } = require("tiktoken/lite");
const { load } = require("tiktoken/load");
const registry = require("tiktoken/registry.json");
const models = require("tiktoken/model_to_encoding.json");

async function countTokens(text) {
  const model = await load(registry[models["gpt-3.5-turbo"]]);
  const encoder = new Tiktoken(
    model.bpe_ranks,
    model.special_tokens,
    model.pat_str
  );
  const tokens = encoder.encode(text);
  encoder.free();
  return tokens.length;
}

module.exports = {
    countTokens
};