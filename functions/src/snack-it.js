const { URLSearchParams } = require('url');
const Octokit = require('@octokit/rest');
const { postTemplate } = require('./snack-it-template');

const owner = 'trys';
const repo = 'javasnack';

const github = Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const REGEX_SANIT_TITLE = new RegExp('[:]', 'g');
const REGEX_HEADINGS = new RegExp(/^([*])(.+)[*]$/, 'm');
const REGEX_TASTE_SCORE = new RegExp(/^Taste:|^Flavour:|^Flavor:/, 'im');
const REGEX_PRESENT_SCORE = new RegExp(/^Presentation:|^Appearance:|^Look:/, 'im');
const REGEX_VALUE_SCORE = new RegExp(/^Value for money:|^Value:|^VFM:/, 'im');

exports.handler = async event => {
  const { headers, httpMethod: method, body, queryStringParameters: query } = event;

  if (method !== 'POST') {
    return {
      statusCode: 501,
      body: 'Nothing to see here...',
    };
  }

  try {
    if (query.secret !== process.env.SECRET) {
      throw new Error('Unauthorized');
    }

    // The message comes in from Slack as a urlencoded string, so parse it
    const parameters = new URLSearchParams(body);

    const data = JSON.parse(parameters.get('payload'));

    if (data.message.type !== 'message') {
      throw new Error('Payload must be a message');
    }

    // Parse the Slack payload
    const review = parseReview(data);

    // Generate the post template with the review object
    const post = generateTemplate(review);

    // Publish it to GitHub
    await createPost(review.title, post);

    return {
      statusCode: 200,
      body: 'Snacked!',
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: 400,
      body: e.toString(),
    };
  }
};

/**
 * String replaces placeholders with the correct data
 * @param {Object} review - the review object
 * @returns {String} - the review HTML
 */
function generateTemplate(review) {
  const { title, username, scores, body } = review;
  const template = postTemplate;
  const date = new Date().toISOString();

  return template
    .replace('##TITLE##', title)
    .replace('##AUTHOR##', username)
    .replace('##DATE##', date)
    .replace('##TASTE##', scores.taste)
    .replace('##PRESENT##', scores.presentation)
    .replace('##VALUE##', scores.value)
    .replace('##BODY##', body);
}

/**
 * Performs a parse of the review from Slack and converts it into
 * a data object with what we need for a post.
 * @param {String} data - the payload from slack
 * @returns {Object} - the review object
 */
function parseReview(data) {
  let review = data.message.text;
  const username = data.user.name;

  // The title should always be the first line
  const title = review.split('\n')[0].replace(REGEX_SANIT_TITLE, '');

  const scores = {};

  for (const score of [
    { key: 'taste', pattern: REGEX_TASTE_SCORE },
    { key: 'presentation', pattern: REGEX_PRESENT_SCORE },
    { key: 'value', pattern: REGEX_VALUE_SCORE },
  ]) {
    const match = review.match(score.pattern);
    const searchIndex = match.index + match[0].length;
    const pad = 4;

    /**
     * Substring the review string from after the colon here: `Taste:` plus `pad` characters
     * (to account for possible space + decimal point) and then use the /\D/g expression to
     * filter out any accidental non-digit characters, and then turn it into a number.
     */
    scores[score.key] = Number(review.substring(searchIndex, searchIndex + pad).replace(/\D/g, ''));
  }

  /**
   * If there's a --begin-- signal, we get the content after the --begin-- signal.
   * If there's no signal, we take a "best guess" and get the content from line 5
   * onwards.
   */
  if (typeof review.split('--begin--')[1] !== 'undefined') {
    review = review.split('--begin--')[1];
  } else {
    review = review
      .split('\n')
      .splice(5)
      .join('\n');
  }

  /**
   * Replace any *Slack Formatted* headings with h2 (##) tags
   * whilst retaining any body bold text.
   */
  while (review.match(REGEX_HEADINGS)) {
    const [_, char, innerText] = review.match(REGEX_HEADINGS);
    review = review.replace(REGEX_HEADINGS, `## ${innerText}`);
  }

  return { title, scores, username, body: review };
}

/**
 * Does a bunch of GitHub API calls to get our generated
 * Sergey template into the GitHub repo.
 * @param {String} title - the title of the post
 * @param {String} post - the post HTML generated from generateTemplate()
 * @returns {Promise<UpdateRef>}
 */
async function createPost(title, post) {
  const branch = await github.gitdata.getRef({
    owner,
    repo,
    ref: 'heads/master',
  });

  const tree = await github.git.createTree({
    owner,
    repo,
    tree: [
      {
        path: `content/${slug(title)}.md`,
        mode: '100644',
        type: 'blob',
        content: post,
      },
    ],
    base_tree: branch.data.object.sha,
  });

  const commit = await github.git.createCommit({
    owner,
    repo,
    message: `New JavaSnack!`,
    tree: tree.data.sha,
    parents: [branch.data.object.sha],
  });

  return await github.git.updateRef({
    owner,
    repo,
    ref: 'heads/master',
    sha: commit.data.sha,
    force: true,
  });
}

function slug(s) {
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}
