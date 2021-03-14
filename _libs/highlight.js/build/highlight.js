/*
  Highlight.js 10.3.99 (b957609a)
  License: BSD-3-Clause
  Copyright (c) 2006-2020, Ivan Sagalaev
*/
var hljs = (function () {
  'use strict';

  // https://github.com/substack/deep-freeze/blob/master/index.js
  
  function deepFreeze(obj) {
    Object.freeze(obj);

    var objIsFunction = typeof obj === 'function';

    Object.getOwnPropertyNames(obj).forEach(function(prop) {
      if (Object.hasOwnProperty.call(obj, prop)
      && obj[prop] !== null
      && (typeof obj[prop] === "object" || typeof obj[prop] === "function")
      // IE11 fix: https://github.com/highlightjs/highlight.js/issues/2318
      // TODO: remove in the future
      && (objIsFunction ? prop !== 'caller' && prop !== 'callee' && prop !== 'arguments' : true)
      && !Object.isFrozen(obj[prop])) {
        deepFreeze(obj[prop]);
      }
    });

    return obj;
  }

  class Response {
    /**
     * @param {CompiledMode} mode
     */
    constructor(mode) {
      // eslint-disable-next-line no-undefined
      if (mode.data === undefined) mode.data = {};

      this.data = mode.data;
    }

    ignoreMatch() {
      this.ignore = true;
    }
  }

  /**
   * @param {string} value
   * @returns {string}
   */
  function escapeHTML(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  /**
   * performs a shallow merge of multiple objects into one
   *
   * @template T
   * @param {T} original
   * @param {Record<string,any>[]} objects
   * @returns {T} a single new object
   */
  function inherit(original, ...objects) {
    /** @type Record<string,any> */
    var result = {};

    for (const key in original) {
      result[key] = original[key];
    }
    objects.forEach(function(obj) {
      for (const key in obj) {
        result[key] = obj[key];
      }
    });
    return /** @type {T} */ (result);
  }

  /* Stream merging */

  /**
   * @typedef Event
   * @property {'start'|'stop'} event
   * @property {number} offset
   * @property {Node} node
   */

  /**
   * @param {Node} node
   */
  function tag(node) {
    return node.nodeName.toLowerCase();
  }

  /**
   * @param {Node} node
   */
  function nodeStream(node) {
    /** @type Event[] */
    var result = [];
    (function _nodeStream(node, offset) {
      for (var child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 3) {
          offset += child.nodeValue.length;
        } else if (child.nodeType === 1) {
          result.push({
            event: 'start',
            offset: offset,
            node: child
          });
          offset = _nodeStream(child, offset);
          // Prevent void elements from having an end tag that would actually
          // double them in the output. There are more void elements in HTML
          // but we list only those realistically expected in code display.
          if (!tag(child).match(/br|hr|img|input/)) {
            result.push({
              event: 'stop',
              offset: offset,
              node: child
            });
          }
        }
      }
      return offset;
    })(node, 0);
    return result;
  }

  /**
   * @param {any} original - the original stream
   * @param {any} highlighted - stream of the highlighted source
   * @param {string} value - the original source itself
   */
  function mergeStreams(original, highlighted, value) {
    var processed = 0;
    var result = '';
    var nodeStack = [];

    function selectStream() {
      if (!original.length || !highlighted.length) {
        return original.length ? original : highlighted;
      }
      if (original[0].offset !== highlighted[0].offset) {
        return (original[0].offset < highlighted[0].offset) ? original : highlighted;
      }

      /*
      To avoid starting the stream just before it should stop the order is
      ensured that original always starts first and closes last:

      if (event1 == 'start' && event2 == 'start')
        return original;
      if (event1 == 'start' && event2 == 'stop')
        return highlighted;
      if (event1 == 'stop' && event2 == 'start')
        return original;
      if (event1 == 'stop' && event2 == 'stop')
        return highlighted;

      ... which is collapsed to:
      */
      return highlighted[0].event === 'start' ? original : highlighted;
    }

    /**
     * @param {Node} node
     */
    function open(node) {
      /** @param {Attr} attr */
      function attributeString(attr) {
        return ' ' + attr.nodeName + '="' + escapeHTML(attr.value) + '"';
      }
      // @ts-ignore
      result += '<' + tag(node) + [].map.call(node.attributes, attributeString).join('') + '>';
    }

    /**
     * @param {Node} node
     */
    function close(node) {
      result += '</' + tag(node) + '>';
    }

    /**
     * @param {Event} event
     */
    function render(event) {
      (event.event === 'start' ? open : close)(event.node);
    }

    while (original.length || highlighted.length) {
      var stream = selectStream();
      result += escapeHTML(value.substring(processed, stream[0].offset));
      processed = stream[0].offset;
      if (stream === original) {
        /*
        On any opening or closing tag of the original markup we first close
        the entire highlighted node stack, then render the original tag along
        with all the following original tags at the same offset and then
        reopen all the tags on the highlighted stack.
        */
        nodeStack.reverse().forEach(close);
        do {
          render(stream.splice(0, 1)[0]);
          stream = selectStream();
        } while (stream === original && stream.length && stream[0].offset === processed);
        nodeStack.reverse().forEach(open);
      } else {
        if (stream[0].event === 'start') {
          nodeStack.push(stream[0].node);
        } else {
          nodeStack.pop();
        }
        render(stream.splice(0, 1)[0]);
      }
    }
    return result + escapeHTML(value.substr(processed));
  }

  var utils = /*#__PURE__*/Object.freeze({
    __proto__: null,
    escapeHTML: escapeHTML,
    inherit: inherit,
    nodeStream: nodeStream,
    mergeStreams: mergeStreams
  });

  /**
   * @typedef {object} Renderer
   * @property {(text: string) => void} addText
   * @property {(node: Node) => void} openNode
   * @property {(node: Node) => void} closeNode
   * @property {() => string} value
   */

  /** @typedef {{kind?: string, sublanguage?: boolean}} Node */
  /** @typedef {{walk: (r: Renderer) => void}} Tree */
  /** */

  const SPAN_CLOSE = '</span>';

  /**
   * Determines if a node needs to be wrapped in <span>
   *
   * @param {Node} node */
  const emitsWrappingTags = (node) => {
    return !!node.kind;
  };

  /** @type {Renderer} */
  class HTMLRenderer {
    /**
     * Creates a new HTMLRenderer
     *
     * @param {Tree} parseTree - the parse tree (must support `walk` API)
     * @param {{classPrefix: string}} options
     */
    constructor(parseTree, options) {
      this.buffer = "";
      this.classPrefix = options.classPrefix;
      parseTree.walk(this);
    }

    /**
     * Adds texts to the output stream
     *
     * @param {string} text */
    addText(text) {
      this.buffer += escapeHTML(text);
    }

    /**
     * Adds a node open to the output stream (if needed)
     *
     * @param {Node} node */
    openNode(node) {
      if (!emitsWrappingTags(node)) return;

      let className = node.kind;
      if (!node.sublanguage) {
        className = `${this.classPrefix}${className}`;
      }
      this.span(className);
    }

    /**
     * Adds a node close to the output stream (if needed)
     *
     * @param {Node} node */
    closeNode(node) {
      if (!emitsWrappingTags(node)) return;

      this.buffer += SPAN_CLOSE;
    }

    /**
     * returns the accumulated buffer
    */
    value() {
      return this.buffer;
    }

    // helpers

    /**
     * Builds a span element
     *
     * @param {string} className */
    span(className) {
      this.buffer += `<span class="${className}">`;
    }
  }

  /** @typedef {{kind?: string, sublanguage?: boolean, children: Node[]} | string} Node */
  /** @typedef {{kind?: string, sublanguage?: boolean, children: Node[]} } DataNode */
  /**  */

  class TokenTree {
    constructor() {
      /** @type DataNode */
      this.rootNode = { children: [] };
      this.stack = [this.rootNode];
    }

    get top() {
      return this.stack[this.stack.length - 1];
    }

    get root() { return this.rootNode; }

    /** @param {Node} node */
    add(node) {
      this.top.children.push(node);
    }

    /** @param {string} kind */
    openNode(kind) {
      /** @type Node */
      const node = { kind, children: [] };
      this.add(node);
      this.stack.push(node);
    }

    closeNode() {
      if (this.stack.length > 1) {
        return this.stack.pop();
      }
      // eslint-disable-next-line no-undefined
      return undefined;
    }

    closeAllNodes() {
      while (this.closeNode());
    }

    toJSON() {
      return JSON.stringify(this.rootNode, null, 4);
    }

    /**
     * @typedef { import("./html_renderer").Renderer } Renderer
     * @param {Renderer} builder
     */
    walk(builder) {
      // this does not
      return this.constructor._walk(builder, this.rootNode);
      // this works
      // return TokenTree._walk(builder, this.rootNode);
    }

    /**
     * @param {Renderer} builder
     * @param {Node} node
     */
    static _walk(builder, node) {
      if (typeof node === "string") {
        builder.addText(node);
      } else if (node.children) {
        builder.openNode(node);
        node.children.forEach((child) => this._walk(builder, child));
        builder.closeNode(node);
      }
      return builder;
    }

    /**
     * @param {Node} node
     */
    static _collapse(node) {
      if (typeof node === "string") return;
      if (!node.children) return;

      if (node.children.every(el => typeof el === "string")) {
        // node.text = node.children.join("");
        // delete node.children;
        node.children = [node.children.join("")];
      } else {
        node.children.forEach((child) => {
          TokenTree._collapse(child);
        });
      }
    }
  }

  /**
    Currently this is all private API, but this is the minimal API necessary
    that an Emitter must implement to fully support the parser.

    Minimal interface:

    - addKeyword(text, kind)
    - addText(text)
    - addSublanguage(emitter, subLanguageName)
    - finalize()
    - openNode(kind)
    - closeNode()
    - closeAllNodes()
    - toHTML()

  */

  /**
   * @implements {Emitter}
   */
  class TokenTreeEmitter extends TokenTree {
    /**
     * @param {*} options
     */
    constructor(options) {
      super();
      this.options = options;
    }

    /**
     * @param {string} text
     * @param {string} kind
     */
    addKeyword(text, kind) {
      if (text === "") { return; }

      this.openNode(kind);
      this.addText(text);
      this.closeNode();
    }

    /**
     * @param {string} text
     */
    addText(text) {
      if (text === "") { return; }

      this.add(text);
    }

    /**
     * @param {Emitter & {root: DataNode}} emitter
     * @param {string} name
     */
    addSublanguage(emitter, name) {
      /** @type DataNode */
      const node = emitter.root;
      node.kind = name;
      node.sublanguage = true;
      this.add(node);
    }

    toHTML() {
      const renderer = new HTMLRenderer(this, this.options);
      return renderer.value();
    }

    finalize() {
      return true;
    }
  }

  /**
   * @param {string} value
   * @returns {RegExp}
   * */
  function escape(value) {
    return new RegExp(value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'm');
  }

  /**
   * @param {RegExp | string } re
   * @returns {string}
   */
  function source(re) {
    if (!re) return null;
    if (typeof re === "string") return re;

    return re.source;
  }

  /**
   * @param {...(RegExp | string) } args
   * @returns {string}
   */
  function concat(...args) {
    const joined = args.map((x) => source(x)).join("");
    return joined;
  }

  /**
   * @param {RegExp} re
   * @returns {number}
   */
  function countMatchGroups(re) {
    return (new RegExp(re.toString() + '|')).exec('').length - 1;
  }

  /**
   * Does lexeme start with a regular expression match at the beginning
   * @param {RegExp} re
   * @param {string} lexeme
   */
  function startsWith(re, lexeme) {
    var match = re && re.exec(lexeme);
    return match && match.index === 0;
  }

  // join logically computes regexps.join(separator), but fixes the
  // backreferences so they continue to match.
  // it also places each individual regular expression into it's own
  // match group, keeping track of the sequencing of those match groups
  // is currently an exercise for the caller. :-)
  /**
   * @param {(string | RegExp)[]} regexps
   * @param {string} separator
   * @returns {string}
   */
  function join(regexps, separator = "|") {
    // backreferenceRe matches an open parenthesis or backreference. To avoid
    // an incorrect parse, it additionally matches the following:
    // - [...] elements, where the meaning of parentheses and escapes change
    // - other escape sequences, so we do not misparse escape sequences as
    //   interesting elements
    // - non-matching or lookahead parentheses, which do not capture. These
    //   follow the '(' with a '?'.
    var backreferenceRe = /\[(?:[^\\\]]|\\.)*\]|\(\??|\\([1-9][0-9]*)|\\./;
    var numCaptures = 0;
    var ret = '';
    for (var i = 0; i < regexps.length; i++) {
      numCaptures += 1;
      var offset = numCaptures;
      var re = source(regexps[i]);
      if (i > 0) {
        ret += separator;
      }
      ret += "(";
      while (re.length > 0) {
        var match = backreferenceRe.exec(re);
        if (match == null) {
          ret += re;
          break;
        }
        ret += re.substring(0, match.index);
        re = re.substring(match.index + match[0].length);
        if (match[0][0] === '\\' && match[1]) {
          // Adjust the backreference.
          ret += '\\' + String(Number(match[1]) + offset);
        } else {
          ret += match[0];
          if (match[0] === '(') {
            numCaptures++;
          }
        }
      }
      ret += ")";
    }
    return ret;
  }

  // Common regexps
  const IDENT_RE = '[a-zA-Z]\\w*';
  const UNDERSCORE_IDENT_RE = '[a-zA-Z_]\\w*';
  const NUMBER_RE = '\\b\\d+(\\.\\d+)?';
  const C_NUMBER_RE = '(-?)(\\b0[xX][a-fA-F0-9]+|(\\b\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?)'; // 0x..., 0..., decimal, float
  const BINARY_NUMBER_RE = '\\b(0b[01]+)'; // 0b...
  const RE_STARTERS_RE = '!|!=|!==|%|%=|&|&&|&=|\\*|\\*=|\\+|\\+=|,|-|-=|/=|/|:|;|<<|<<=|<=|<|===|==|=|>>>=|>>=|>=|>>>|>>|>|\\?|\\[|\\{|\\(|\\^|\\^=|\\||\\|=|\\|\\||~';

  /**
  * @param { Partial<Mode> & {binary?: string | RegExp} } opts
  */
  const SHEBANG = (opts = {}) => {
    const beginShebang = /^#![ ]*\//;
    if (opts.binary) {
      opts.begin = concat(
        beginShebang,
        /.*\b/,
        opts.binary,
        /\b.*/);
    }
    return inherit({
      className: 'meta',
      begin: beginShebang,
      end: /$/,
      relevance: 0,
      /** @type {ModeCallback} */
      "on:begin": (m, resp) => {
        if (m.index !== 0) resp.ignoreMatch();
      }
    }, opts);
  };

  // Common modes
  const BACKSLASH_ESCAPE = {
    begin: '\\\\[\\s\\S]', relevance: 0
  };
  const APOS_STRING_MODE = {
    className: 'string',
    begin: '\'',
    end: '\'',
    illegal: '\\n',
    contains: [BACKSLASH_ESCAPE]
  };
  const QUOTE_STRING_MODE = {
    className: 'string',
    begin: '"',
    end: '"',
    illegal: '\\n',
    contains: [BACKSLASH_ESCAPE]
  };
  const PHRASAL_WORDS_MODE = {
    begin: /\b(a|an|the|are|I'm|isn't|don't|doesn't|won't|but|just|should|pretty|simply|enough|gonna|going|wtf|so|such|will|you|your|they|like|more)\b/
  };
  /**
   * Creates a comment mode
   *
   * @param {string | RegExp} begin
   * @param {string | RegExp} end
   * @param {Mode | {}} [modeOptions]
   * @returns {Partial<Mode>}
   */
  const COMMENT = function(begin, end, modeOptions = {}) {
    var mode = inherit(
      {
        className: 'comment',
        begin,
        end,
        contains: []
      },
      modeOptions
    );
    mode.contains.push(PHRASAL_WORDS_MODE);
    mode.contains.push({
      className: 'doctag',
      begin: '(?:TODO|FIXME|NOTE|BUG|OPTIMIZE|HACK|XXX):',
      relevance: 0
    });
    return mode;
  };
  const C_LINE_COMMENT_MODE = COMMENT('//', '$');
  const C_BLOCK_COMMENT_MODE = COMMENT('/\\*', '\\*/');
  const HASH_COMMENT_MODE = COMMENT('#', '$');
  const NUMBER_MODE = {
    className: 'number',
    begin: NUMBER_RE,
    relevance: 0
  };
  const C_NUMBER_MODE = {
    className: 'number',
    begin: C_NUMBER_RE,
    relevance: 0
  };
  const BINARY_NUMBER_MODE = {
    className: 'number',
    begin: BINARY_NUMBER_RE,
    relevance: 0
  };
  const CSS_NUMBER_MODE = {
    className: 'number',
    begin: NUMBER_RE + '(' +
      '%|em|ex|ch|rem' +
      '|vw|vh|vmin|vmax' +
      '|cm|mm|in|pt|pc|px' +
      '|deg|grad|rad|turn' +
      '|s|ms' +
      '|Hz|kHz' +
      '|dpi|dpcm|dppx' +
      ')?',
    relevance: 0
  };
  const REGEXP_MODE = {
    // this outer rule makes sure we actually have a WHOLE regex and not simply
    // an expression such as:
    //
    //     3 / something
    //
    // (which will then blow up when regex's `illegal` sees the newline)
    begin: /(?=\/[^/\n]*\/)/,
    contains: [{
      className: 'regexp',
      begin: /\//,
      end: /\/[gimuy]*/,
      illegal: /\n/,
      contains: [
        BACKSLASH_ESCAPE,
        {
          begin: /\[/,
          end: /\]/,
          relevance: 0,
          contains: [BACKSLASH_ESCAPE]
        }
      ]
    }]
  };
  const TITLE_MODE = {
    className: 'title',
    begin: IDENT_RE,
    relevance: 0
  };
  const UNDERSCORE_TITLE_MODE = {
    className: 'title',
    begin: UNDERSCORE_IDENT_RE,
    relevance: 0
  };
  const METHOD_GUARD = {
    // excludes method names from keyword processing
    begin: '\\.\\s*' + UNDERSCORE_IDENT_RE,
    relevance: 0
  };

  /**
   * Adds end same as begin mechanics to a mode
   *
   * Your mode must include at least a single () match group as that first match
   * group is what is used for comparison
   * @param {Partial<Mode>} mode
   */
  const END_SAME_AS_BEGIN = function(mode) {
    return Object.assign(mode,
      {
        /** @type {ModeCallback} */
        'on:begin': (m, resp) => { resp.data._beginMatch = m[1]; },
        /** @type {ModeCallback} */
        'on:end': (m, resp) => { if (resp.data._beginMatch !== m[1]) resp.ignoreMatch(); }
      });
  };

  var MODES = /*#__PURE__*/Object.freeze({
    __proto__: null,
    IDENT_RE: IDENT_RE,
    UNDERSCORE_IDENT_RE: UNDERSCORE_IDENT_RE,
    NUMBER_RE: NUMBER_RE,
    C_NUMBER_RE: C_NUMBER_RE,
    BINARY_NUMBER_RE: BINARY_NUMBER_RE,
    RE_STARTERS_RE: RE_STARTERS_RE,
    SHEBANG: SHEBANG,
    BACKSLASH_ESCAPE: BACKSLASH_ESCAPE,
    APOS_STRING_MODE: APOS_STRING_MODE,
    QUOTE_STRING_MODE: QUOTE_STRING_MODE,
    PHRASAL_WORDS_MODE: PHRASAL_WORDS_MODE,
    COMMENT: COMMENT,
    C_LINE_COMMENT_MODE: C_LINE_COMMENT_MODE,
    C_BLOCK_COMMENT_MODE: C_BLOCK_COMMENT_MODE,
    HASH_COMMENT_MODE: HASH_COMMENT_MODE,
    NUMBER_MODE: NUMBER_MODE,
    C_NUMBER_MODE: C_NUMBER_MODE,
    BINARY_NUMBER_MODE: BINARY_NUMBER_MODE,
    CSS_NUMBER_MODE: CSS_NUMBER_MODE,
    REGEXP_MODE: REGEXP_MODE,
    TITLE_MODE: TITLE_MODE,
    UNDERSCORE_TITLE_MODE: UNDERSCORE_TITLE_MODE,
    METHOD_GUARD: METHOD_GUARD,
    END_SAME_AS_BEGIN: END_SAME_AS_BEGIN
  });

  // keywords that should have no default relevance value
  var COMMON_KEYWORDS = 'of and for in not or if then'.split(' ');

  // compilation

  /**
   * Compiles a language definition result
   *
   * Given the raw result of a language definition (Language), compiles this so
   * that it is ready for highlighting code.
   * @param {Language} language
   * @returns {CompiledLanguage}
   */
  function compileLanguage(language) {
    /**
     * Builds a regex with the case sensativility of the current language
     *
     * @param {RegExp | string} value
     * @param {boolean} [global]
     */
    function langRe(value, global) {
      return new RegExp(
        source(value),
        'm' + (language.case_insensitive ? 'i' : '') + (global ? 'g' : '')
      );
    }

    /**
      Stores multiple regular expressions and allows you to quickly search for
      them all in a string simultaneously - returning the first match.  It does
      this by creating a huge (a|b|c) regex - each individual item wrapped with ()
      and joined by `|` - using match groups to track position.  When a match is
      found checking which position in the array has content allows us to figure
      out which of the original regexes / match groups triggered the match.

      The match object itself (the result of `Regex.exec`) is returned but also
      enhanced by merging in any meta-data that was registered with the regex.
      This is how we keep track of which mode matched, and what type of rule
      (`illegal`, `begin`, end, etc).
    */
    class MultiRegex {
      constructor() {
        this.matchIndexes = {};
        // @ts-ignore
        this.regexes = [];
        this.matchAt = 1;
        this.position = 0;
      }

      // @ts-ignore
      addRule(re, opts) {
        opts.position = this.position++;
        // @ts-ignore
        this.matchIndexes[this.matchAt] = opts;
        this.regexes.push([opts, re]);
        this.matchAt += countMatchGroups(re) + 1;
      }

      compile() {
        if (this.regexes.length === 0) {
          // avoids the need to check length every time exec is called
          // @ts-ignore
          this.exec = () => null;
        }
        const terminators = this.regexes.map(el => el[1]);
        this.matcherRe = langRe(join(terminators), true);
        this.lastIndex = 0;
      }

      /** @param {string} s */
      exec(s) {
        this.matcherRe.lastIndex = this.lastIndex;
        const match = this.matcherRe.exec(s);
        if (!match) { return null; }

        // eslint-disable-next-line no-undefined
        const i = match.findIndex((el, i) => i > 0 && el !== undefined);
        // @ts-ignore
        const matchData = this.matchIndexes[i];
        // trim off any earlier non-relevant match groups (ie, the other regex
        // match groups that make up the multi-matcher)
        match.splice(0, i);

        return Object.assign(match, matchData);
      }
    }

    /*
      Created to solve the key deficiently with MultiRegex - there is no way to
      test for multiple matches at a single location.  Why would we need to do
      that?  In the future a more dynamic engine will allow certain matches to be
      ignored.  An example: if we matched say the 3rd regex in a large group but
      decided to ignore it - we'd need to started testing again at the 4th
      regex... but MultiRegex itself gives us no real way to do that.

      So what this class creates MultiRegexs on the fly for whatever search
      position they are needed.

      NOTE: These additional MultiRegex objects are created dynamically.  For most
      grammars most of the time we will never actually need anything more than the
      first MultiRegex - so this shouldn't have too much overhead.

      Say this is our search group, and we match regex3, but wish to ignore it.

        regex1 | regex2 | regex3 | regex4 | regex5    ' ie, startAt = 0

      What we need is a new MultiRegex that only includes the remaining
      possibilities:

        regex4 | regex5                               ' ie, startAt = 3

      This class wraps all that complexity up in a simple API... `startAt` decides
      where in the array of expressions to start doing the matching. It
      auto-increments, so if a match is found at position 2, then startAt will be
      set to 3.  If the end is reached startAt will return to 0.

      MOST of the time the parser will be setting startAt manually to 0.
    */
    class ResumableMultiRegex {
      constructor() {
        // @ts-ignore
        this.rules = [];
        // @ts-ignore
        this.multiRegexes = [];
        this.count = 0;

        this.lastIndex = 0;
        this.regexIndex = 0;
      }

      // @ts-ignore
      getMatcher(index) {
        if (this.multiRegexes[index]) return this.multiRegexes[index];

        const matcher = new MultiRegex();
        this.rules.slice(index).forEach(([re, opts]) => matcher.addRule(re, opts));
        matcher.compile();
        this.multiRegexes[index] = matcher;
        return matcher;
      }

      resumingScanAtSamePosition() {
        return this.regexIndex !== 0;
      }

      considerAll() {
        this.regexIndex = 0;
      }

      // @ts-ignore
      addRule(re, opts) {
        this.rules.push([re, opts]);
        if (opts.type === "begin") this.count++;
      }

      /** @param {string} s */
      exec(s) {
        const m = this.getMatcher(this.regexIndex);
        m.lastIndex = this.lastIndex;
        let result = m.exec(s);

        // The following is because we have no easy way to say "resume scanning at the
        // existing position but also skip the current rule ONLY". What happens is
        // all prior rules are also skipped which can result in matching the wrong
        // thing. Example of matching "booger":

        // our matcher is [string, "booger", number]
        //
        // ....booger....

        // if "booger" is ignored then we'd really need a regex to scan from the
        // SAME position for only: [string, number] but ignoring "booger" (if it
        // was the first match), a simple resume would scan ahead who knows how
        // far looking only for "number", ignoring potential string matches (or
        // future "booger" matches that might be valid.)

        // So what we do: We execute two matchers, one resuming at the same
        // position, but the second full matcher starting at the position after:

        //     /--- resume first regex match here (for [number])
        //     |/---- full match here for [string, "booger", number]
        //     vv
        // ....booger....

        // Which ever results in a match first is then used. So this 3-4 step
        // process essentially allows us to say "match at this position, excluding
        // a prior rule that was ignored".
        //
        // 1. Match "booger" first, ignore. Also proves that [string] does non match.
        // 2. Resume matching for [number]
        // 3. Match at index + 1 for [string, "booger", number]
        // 4. If #2 and #3 result in matches, which came first?
        if (this.resumingScanAtSamePosition()) {
          if (result && result.index === this.lastIndex) ; else { // use the second matcher result
            const m2 = this.getMatcher(0);
            m2.lastIndex = this.lastIndex + 1;
            result = m2.exec(s);
          }
        }

        if (result) {
          this.regexIndex += result.position + 1;
          if (this.regexIndex === this.count) {
            // wrap-around to considering all matches again
            this.considerAll();
          }
        }

        return result;
      }
    }

    /**
     * Given a mode, builds a huge ResumableMultiRegex that can be used to walk
     * the content and find matches.
     *
     * @param {CompiledMode} mode
     * @returns {ResumableMultiRegex}
     */
    function buildModeRegex(mode) {
      const mm = new ResumableMultiRegex();

      mode.contains.forEach(term => mm.addRule(term.begin, { rule: term, type: "begin" }));

      if (mode.terminator_end) {
        mm.addRule(mode.terminator_end, { type: "end" });
      }
      if (mode.illegal) {
        mm.addRule(mode.illegal, { type: "illegal" });
      }

      return mm;
    }

    // TODO: We need negative look-behind support to do this properly
    /**
     * Skip a match if it has a preceding or trailing dot
     *
     * This is used for `beginKeywords` to prevent matching expressions such as
     * `bob.keyword.do()`. The mode compiler automatically wires this up as a
     * special _internal_ 'on:begin' callback for modes with `beginKeywords`
     * @param {RegExpMatchArray} match
     * @param {CallbackResponse} response
     */
    function skipIfhasPrecedingOrTrailingDot(match, response) {
      const before = match.input[match.index - 1];
      const after = match.input[match.index + match[0].length];
      if (before === "." || after === ".") {
        response.ignoreMatch();
      }
    }

    /** skip vs abort vs ignore
     *
     * @skip   - The mode is still entered and exited normally (and contains rules apply),
     *           but all content is held and added to the parent buffer rather than being
     *           output when the mode ends.  Mostly used with `sublanguage` to build up
     *           a single large buffer than can be parsed by sublanguage.
     *
     *             - The mode begin ands ends normally.
     *             - Content matched is added to the parent mode buffer.
     *             - The parser cursor is moved forward normally.
     *
     * @abort  - A hack placeholder until we have ignore.  Aborts the mode (as if it
     *           never matched) but DOES NOT continue to match subsequent `contains`
     *           modes.  Abort is bad/suboptimal because it can result in modes
     *           farther down not getting applied because an earlier rule eats the
     *           content but then aborts.
     *
     *             - The mode does not begin.
     *             - Content matched by `begin` is added to the mode buffer.
     *             - The parser cursor is moved forward accordingly.
     *
     * @ignore - Ignores the mode (as if it never matched) and continues to match any
     *           subsequent `contains` modes.  Ignore isn't technically possible with
     *           the current parser implementation.
     *
     *             - The mode does not begin.
     *             - Content matched by `begin` is ignored.
     *             - The parser cursor is not moved forward.
     */

    /**
     * Compiles an individual mode
     *
     * This can raise an error if the mode contains certain detectable known logic
     * issues.
     * @param {Mode} mode
     * @param {CompiledMode | null} [parent]
     * @returns {CompiledMode | never}
     */
    function compileMode(mode, parent) {
      const cmode = /** @type CompiledMode */ (mode);
      if (mode.compiled) return cmode;
      mode.compiled = true;

      // __beforeBegin is considered private API, internal use only
      mode.__beforeBegin = null;

      mode.keywords = mode.keywords || mode.beginKeywords;

      let keywordPattern = null;
      if (typeof mode.keywords === "object") {
        keywordPattern = mode.keywords.$pattern;
        delete mode.keywords.$pattern;
      }

      if (mode.keywords) {
        mode.keywords = compileKeywords(mode.keywords, language.case_insensitive);
      }

      // both are not allowed
      if (mode.lexemes && keywordPattern) {
        throw new Error("ERR: Prefer `keywords.$pattern` to `mode.lexemes`, BOTH are not allowed. (see mode reference) ");
      }

      // `mode.lexemes` was the old standard before we added and now recommend
      // using `keywords.$pattern` to pass the keyword pattern
      cmode.keywordPatternRe = langRe(mode.lexemes || keywordPattern || /\w+/, true);

      if (parent) {
        if (mode.beginKeywords) {
          // for languages with keywords that include non-word characters checking for
          // a word boundary is not sufficient, so instead we check for a word boundary
          // or whitespace - this does no harm in any case since our keyword engine
          // doesn't allow spaces in keywords anyways and we still check for the boundary
          // first
          mode.begin = '\\b(' + mode.beginKeywords.split(' ').join('|') + ')(?=\\b|\\s)';
          mode.__beforeBegin = skipIfhasPrecedingOrTrailingDot;
        }
        if (!mode.begin) mode.begin = /\B|\b/;
        cmode.beginRe = langRe(mode.begin);
        if (mode.endSameAsBegin) mode.end = mode.begin;
        if (!mode.end && !mode.endsWithParent) mode.end = /\B|\b/;
        if (mode.end) cmode.endRe = langRe(mode.end);
        cmode.terminator_end = source(mode.end) || '';
        if (mode.endsWithParent && parent.terminator_end) {
          cmode.terminator_end += (mode.end ? '|' : '') + parent.terminator_end;
        }
      }
      if (mode.illegal) cmode.illegalRe = langRe(mode.illegal);
      // eslint-disable-next-line no-undefined
      if (mode.relevance === undefined) mode.relevance = 1;
      if (!mode.contains) mode.contains = [];

      mode.contains = [].concat(...mode.contains.map(function(c) {
        return expandOrCloneMode(c === 'self' ? mode : c);
      }));
      mode.contains.forEach(function(c) { compileMode(/** @type Mode */ (c), cmode); });

      if (mode.starts) {
        compileMode(mode.starts, parent);
      }

      cmode.matcher = buildModeRegex(cmode);
      return cmode;
    }

    // self is not valid at the top-level
    if (language.contains && language.contains.includes('self')) {
      throw new Error("ERR: contains `self` is not supported at the top-level of a language.  See documentation.");
    }
    return compileMode(/** @type Mode */ (language));
  }

  /**
   * Determines if a mode has a dependency on it's parent or not
   *
   * If a mode does have a parent dependency then often we need to clone it if
   * it's used in multiple places so that each copy points to the correct parent,
   * where-as modes without a parent can often safely be re-used at the bottom of
   * a mode chain.
   *
   * @param {Mode | null} mode
   * @returns {boolean} - is there a dependency on the parent?
   * */
  function dependencyOnParent(mode) {
    if (!mode) return false;

    return mode.endsWithParent || dependencyOnParent(mode.starts);
  }

  /**
   * Expands a mode or clones it if necessary
   *
   * This is necessary for modes with parental dependenceis (see notes on
   * `dependencyOnParent`) and for nodes that have `variants` - which must then be
   * exploded into their own individual modes at compile time.
   *
   * @param {Mode} mode
   * @returns {Mode | Mode[]}
   * */
  function expandOrCloneMode(mode) {
    if (mode.variants && !mode.cached_variants) {
      mode.cached_variants = mode.variants.map(function(variant) {
        return inherit(mode, { variants: null }, variant);
      });
    }

    // EXPAND
    // if we have variants then essentially "replace" the mode with the variants
    // this happens in compileMode, where this function is called from
    if (mode.cached_variants) {
      return mode.cached_variants;
    }

    // CLONE
    // if we have dependencies on parents then we need a unique
    // instance of ourselves, so we can be reused with many
    // different parents without issue
    if (dependencyOnParent(mode)) {
      return inherit(mode, { starts: mode.starts ? inherit(mode.starts) : null });
    }

    if (Object.isFrozen(mode)) {
      return inherit(mode);
    }

    // no special dependency issues, just return ourselves
    return mode;
  }

  /***********************************************
    Keywords
  ***********************************************/

  /**
   * Given raw keywords from a language definition, compile them.
   *
   * @param {string | Record<string,string>} rawKeywords
   * @param {boolean} caseInsensitive
   */
  function compileKeywords(rawKeywords, caseInsensitive) {
    /** @type KeywordDict */
    var compiledKeywords = {};

    if (typeof rawKeywords === 'string') { // string
      splitAndCompile('keyword', rawKeywords);
    } else {
      Object.keys(rawKeywords).forEach(function(className) {
        splitAndCompile(className, rawKeywords[className]);
      });
    }
    return compiledKeywords;

    // ---

    /**
     * Compiles an individual list of keywords
     *
     * Ex: "for if when while|5"
     *
     * @param {string} className
     * @param {string} keywordList
     */
    function splitAndCompile(className, keywordList) {
      if (caseInsensitive) {
        keywordList = keywordList.toLowerCase();
      }
      keywordList.split(' ').forEach(function(keyword) {
        var pair = keyword.split('|');
        compiledKeywords[pair[0]] = [className, scoreForKeyword(pair[0], pair[1])];
      });
    }
  }

  /**
   * Returns the proper score for a given keyword
   *
   * Also takes into account comment keywords, which will be scored 0 UNLESS
   * another score has been manually assigned.
   * @param {string} keyword
   * @param {string} [providedScore]
   */
  function scoreForKeyword(keyword, providedScore) {
    // manual scores always win over common keywords
    // so you can force a score of 1 if you really insist
    if (providedScore) {
      return Number(providedScore);
    }

    return commonKeyword(keyword) ? 0 : 1;
  }

  /**
   * Determines if a given keyword is common or not
   *
   * @param {string} keyword */
  function commonKeyword(keyword) {
    return COMMON_KEYWORDS.includes(keyword.toLowerCase());
  }

  var version = "10.3.99";

  // @ts-nocheck

  function hasValueOrEmptyAttribute(value) {
    return Boolean(value || value === "");
  }

  const Component = {
    props: ["language", "code", "autodetect"],
    data: function() {
      return {
        detectedLanguage: "",
        unknownLanguage: false
      };
    },
    computed: {
      className() {
        if (this.unknownLanguage) return "";

        return "hljs " + this.detectedLanguage;
      },
      highlighted() {
        // no idea what language to use, return raw code
        if (!this.autoDetect && !hljs.getLanguage(this.language)) {
          console.warn(`The language "${this.language}" you specified could not be found.`);
          this.unknownLanguage = true;
          return escapeHTML(this.code);
        }

        let result;
        if (this.autoDetect) {
          result = hljs.highlightAuto(this.code);
          this.detectedLanguage = result.language;
        } else {
          result = hljs.highlight(this.language, this.code, this.ignoreIllegals);
          this.detectectLanguage = this.language;
        }
        return result.value;
      },
      autoDetect() {
        return !this.language || hasValueOrEmptyAttribute(this.autodetect);
      },
      ignoreIllegals() {
        return true;
      }
    },
    // this avoids needing to use a whole Vue compilation pipeline just
    // to build Highlight.js
    render(createElement) {
      return createElement("pre", {}, [
        createElement("code", {
          class: this.className,
          domProps: { innerHTML: this.highlighted }})
      ]);
    }
    // template: `<pre><code :class="className" v-html="highlighted"></code></pre>`
  };

  const VuePlugin = {
    install(Vue) {
      Vue.component('highlightjs', Component);
    }
  };

  /*
  Syntax highlighting with language autodetection.
  https://highlightjs.org/
  */

  const escape$1 = escapeHTML;
  const inherit$1 = inherit;

  const { nodeStream: nodeStream$1, mergeStreams: mergeStreams$1 } = utils;
  const NO_MATCH = Symbol("nomatch");

  /**
   * @param {any} hljs - object that is extended (legacy)
   * @returns {HLJSApi}
   */
  const HLJS = function(hljs) {
    // Convenience variables for build-in objects
    /** @type {unknown[]} */
    var ArrayProto = [];

    // Global internal variables used within the highlight.js library.
    /** @type {Record<string, Language>} */
    var languages = Object.create(null);
    /** @type {Record<string, string>} */
    var aliases = Object.create(null);
    /** @type {HLJSPlugin[]} */
    var plugins = [];

    // safe/production mode - swallows more errors, tries to keep running
    // even if a single syntax or parse hits a fatal error
    var SAFE_MODE = true;
    var fixMarkupRe = /(^(<[^>]+>|\t|)+|\n)/gm;
    var LANGUAGE_NOT_FOUND = "Could not find the language '{}', did you forget to load/include a language module?";
    /** @type {Language} */
    const PLAINTEXT_LANGUAGE = { disableAutodetect: true, name: 'Plain text', contains: [] };

    // Global options used when within external APIs. This is modified when
    // calling the `hljs.configure` function.
    /** @type HLJSOptions */
    var options = {
      noHighlightRe: /^(no-?highlight)$/i,
      languageDetectRe: /\blang(?:uage)?-([\w-]+)\b/i,
      classPrefix: 'hljs-',
      tabReplace: null,
      useBR: false,
      languages: null,
      // beta configuration options, subject to change, welcome to discuss
      // https://github.com/highlightjs/highlight.js/issues/1086
      __emitter: TokenTreeEmitter
    };

    /* Utility functions */

    /**
     * Tests a language name to see if highlighting should be skipped
     * @param {string} languageName
     */
    function shouldNotHighlight(languageName) {
      return options.noHighlightRe.test(languageName);
    }

    /**
     * @param {HighlightedHTMLElement} block - the HTML element to determine language for
     */
    function blockLanguage(block) {
      var classes = block.className + ' ';

      classes += block.parentNode ? block.parentNode.className : '';

      // language-* takes precedence over non-prefixed class names.
      const match = options.languageDetectRe.exec(classes);
      if (match) {
        var language = getLanguage(match[1]);
        if (!language) {
          console.warn(LANGUAGE_NOT_FOUND.replace("{}", match[1]));
          console.warn("Falling back to no-highlight mode for this block.", block);
        }
        return language ? match[1] : 'no-highlight';
      }

      return classes
        .split(/\s+/)
        .find((_class) => shouldNotHighlight(_class) || getLanguage(_class));
    }

    /**
     * Core highlighting function.
     *
     * @param {string} languageName - the language to use for highlighting
     * @param {string} code - the code to highlight
     * @param {boolean} [ignoreIllegals] - whether to ignore illegal matches, default is to bail
     * @param {Mode} [continuation] - current continuation mode, if any
     *
     * @returns {HighlightResult} Result - an object that represents the result
     * @property {string} language - the language name
     * @property {number} relevance - the relevance score
     * @property {string} value - the highlighted HTML code
     * @property {string} code - the original raw code
     * @property {Mode} top - top of the current mode stack
     * @property {boolean} illegal - indicates whether any illegal matches were found
    */
    function highlight(languageName, code, ignoreIllegals, continuation) {
      /** @type {{ code: string, language: string, result?: any }} */
      var context = {
        code,
        language: languageName
      };
      // the plugin can change the desired language or the code to be highlighted
      // just be changing the object it was passed
      fire("before:highlight", context);

      // a before plugin can usurp the result completely by providing it's own
      // in which case we don't even need to call highlight
      var result = context.result ?
        context.result :
        _highlight(context.language, context.code, ignoreIllegals, continuation);

      result.code = context.code;
      // the plugin can change anything in result to suite it
      fire("after:highlight", result);

      return result;
    }

    /**
     * private highlight that's used internally and does not fire callbacks
     *
     * @param {string} languageName - the language to use for highlighting
     * @param {string} code - the code to highlight
     * @param {boolean} [ignoreIllegals] - whether to ignore illegal matches, default is to bail
     * @param {Mode} [continuation] - current continuation mode, if any
    */
    function _highlight(languageName, code, ignoreIllegals, continuation) {
      var codeToHighlight = code;

      /**
       * Return keyword data if a match is a keyword
       * @param {CompiledMode} mode - current mode
       * @param {RegExpMatchArray} match - regexp match data
       * @returns {KeywordData | false}
       */
      function keywordData(mode, match) {
        var matchText = language.case_insensitive ? match[0].toLowerCase() : match[0];
        return Object.prototype.hasOwnProperty.call(mode.keywords, matchText) && mode.keywords[matchText];
      }

      function processKeywords() {
        if (!top.keywords) {
          emitter.addText(modeBuffer);
          return;
        }

        let lastIndex = 0;
        top.keywordPatternRe.lastIndex = 0;
        let match = top.keywordPatternRe.exec(modeBuffer);
        let buf = "";

        while (match) {
          buf += modeBuffer.substring(lastIndex, match.index);
          const data = keywordData(top, match);
          if (data) {
            const [kind, keywordRelevance] = data;
            emitter.addText(buf);
            buf = "";

            relevance += keywordRelevance;
            emitter.addKeyword(match[0], kind);
          } else {
            buf += match[0];
          }
          lastIndex = top.keywordPatternRe.lastIndex;
          match = top.keywordPatternRe.exec(modeBuffer);
        }
        buf += modeBuffer.substr(lastIndex);
        emitter.addText(buf);
      }

      function processSubLanguage() {
        if (modeBuffer === "") return;
        /** @type HighlightResult */
        var result = null;

        if (typeof top.subLanguage === 'string') {
          if (!languages[top.subLanguage]) {
            emitter.addText(modeBuffer);
            return;
          }
          result = _highlight(top.subLanguage, modeBuffer, true, continuations[top.subLanguage]);
          continuations[top.subLanguage] = result.top;
        } else {
          result = highlightAuto(modeBuffer, top.subLanguage.length ? top.subLanguage : null);
        }

        // Counting embedded language score towards the host language may be disabled
        // with zeroing the containing mode relevance. Use case in point is Markdown that
        // allows XML everywhere and makes every XML snippet to have a much larger Markdown
        // score.
        if (top.relevance > 0) {
          relevance += result.relevance;
        }
        emitter.addSublanguage(result.emitter, result.language);
      }

      function processBuffer() {
        if (top.subLanguage != null) {
          processSubLanguage();
        } else {
          processKeywords();
        }
        modeBuffer = '';
      }

      /**
       * @param {Mode} mode - new mode to start
       */
      function startNewMode(mode) {
        if (mode.className) {
          emitter.openNode(mode.className);
        }
        top = Object.create(mode, { parent: { value: top } });
        return top;
      }

      /**
       * @param {CompiledMode } mode - the mode to potentially end
       * @param {RegExpMatchArray} match - the latest match
       * @param {string} matchPlusRemainder - match plus remainder of content
       * @returns {CompiledMode | void} - the next mode, or if void continue on in current mode
       */
      function endOfMode(mode, match, matchPlusRemainder) {
        let matched = startsWith(mode.endRe, matchPlusRemainder);

        if (matched) {
          if (mode["on:end"]) {
            const resp = new Response(mode);
            mode["on:end"](match, resp);
            if (resp.ignore) matched = false;
          }

          if (matched) {
            while (mode.endsParent && mode.parent) {
              mode = mode.parent;
            }
            return mode;
          }
        }
        // even if on:end fires an `ignore` it's still possible
        // that we might trigger the end node because of a parent mode
        if (mode.endsWithParent) {
          return endOfMode(mode.parent, match, matchPlusRemainder);
        }
      }

      /**
       * Handle matching but then ignoring a sequence of text
       *
       * @param {string} lexeme - string containing full match text
       */
      function doIgnore(lexeme) {
        if (top.matcher.regexIndex === 0) {
          // no more regexs to potentially match here, so we move the cursor forward one
          // space
          modeBuffer += lexeme[0];
          return 1;
        } else {
          // no need to move the cursor, we still have additional regexes to try and
          // match at this very spot
          resumeScanAtSamePosition = true;
          return 0;
        }
      }

      /**
       * Handle the start of a new potential mode match
       *
       * @param {EnhancedMatch} match - the current match
       * @returns {number} how far to advance the parse cursor
       */
      function doBeginMatch(match) {
        var lexeme = match[0];
        var newMode = match.rule;

        const resp = new Response(newMode);
        // first internal before callbacks, then the public ones
        const beforeCallbacks = [newMode.__beforeBegin, newMode["on:begin"]];
        for (const cb of beforeCallbacks) {
          if (!cb) continue;
          cb(match, resp);
          if (resp.ignore) return doIgnore(lexeme);
        }

        if (newMode && newMode.endSameAsBegin) {
          newMode.endRe = escape(lexeme);
        }

        if (newMode.skip) {
          modeBuffer += lexeme;
        } else {
          if (newMode.excludeBegin) {
            modeBuffer += lexeme;
          }
          processBuffer();
          if (!newMode.returnBegin && !newMode.excludeBegin) {
            modeBuffer = lexeme;
          }
        }
        startNewMode(newMode);
        // if (mode["after:begin"]) {
        //   let resp = new Response(mode);
        //   mode["after:begin"](match, resp);
        // }
        return newMode.returnBegin ? 0 : lexeme.length;
      }

      /**
       * Handle the potential end of mode
       *
       * @param {RegExpMatchArray} match - the current match
       */
      function doEndMatch(match) {
        var lexeme = match[0];
        var matchPlusRemainder = codeToHighlight.substr(match.index);

        var endMode = endOfMode(top, match, matchPlusRemainder);
        if (!endMode) { return NO_MATCH; }

        var origin = top;
        if (origin.skip) {
          modeBuffer += lexeme;
        } else {
          if (!(origin.returnEnd || origin.excludeEnd)) {
            modeBuffer += lexeme;
          }
          processBuffer();
          if (origin.excludeEnd) {
            modeBuffer = lexeme;
          }
        }
        do {
          if (top.className) {
            emitter.closeNode();
          }
          if (!top.skip && !top.subLanguage) {
            relevance += top.relevance;
          }
          top = top.parent;
        } while (top !== endMode.parent);
        if (endMode.starts) {
          if (endMode.endSameAsBegin) {
            endMode.starts.endRe = endMode.endRe;
          }
          startNewMode(endMode.starts);
        }
        return origin.returnEnd ? 0 : lexeme.length;
      }

      function processContinuations() {
        var list = [];
        for (var current = top; current !== language; current = current.parent) {
          if (current.className) {
            list.unshift(current.className);
          }
        }
        list.forEach(item => emitter.openNode(item));
      }

      /** @type {{type?: MatchType, index?: number, rule?: Mode}}} */
      var lastMatch = {};

      /**
       *  Process an individual match
       *
       * @param {string} textBeforeMatch - text preceeding the match (since the last match)
       * @param {EnhancedMatch} [match] - the match itself
       */
      function processLexeme(textBeforeMatch, match) {
        var lexeme = match && match[0];

        // add non-matched text to the current mode buffer
        modeBuffer += textBeforeMatch;

        if (lexeme == null) {
          processBuffer();
          return 0;
        }

        // we've found a 0 width match and we're stuck, so we need to advance
        // this happens when we have badly behaved rules that have optional matchers to the degree that
        // sometimes they can end up matching nothing at all
        // Ref: https://github.com/highlightjs/highlight.js/issues/2140
        if (lastMatch.type === "begin" && match.type === "end" && lastMatch.index === match.index && lexeme === "") {
          // spit the "skipped" character that our regex choked on back into the output sequence
          modeBuffer += codeToHighlight.slice(match.index, match.index + 1);
          if (!SAFE_MODE) {
            /** @type {AnnotatedError} */
            const err = new Error('0 width match regex');
            err.languageName = languageName;
            err.badRule = lastMatch.rule;
            throw err;
          }
          return 1;
        }
        lastMatch = match;

        if (match.type === "begin") {
          return doBeginMatch(match);
        } else if (match.type === "illegal" && !ignoreIllegals) {
          // illegal match, we do not continue processing
          /** @type {AnnotatedError} */
          const err = new Error('Illegal lexeme "' + lexeme + '" for mode "' + (top.className || '<unnamed>') + '"');
          err.mode = top;
          throw err;
        } else if (match.type === "end") {
          var processed = doEndMatch(match);
          if (processed !== NO_MATCH) {
            return processed;
          }
        }

        // edge case for when illegal matches $ (end of line) which is technically
        // a 0 width match but not a begin/end match so it's not caught by the
        // first handler (when ignoreIllegals is true)
        if (match.type === "illegal" && lexeme === "") {
          // advance so we aren't stuck in an infinite loop
          return 1;
        }

        // infinite loops are BAD, this is a last ditch catch all. if we have a
        // decent number of iterations yet our index (cursor position in our
        // parsing) still 3x behind our index then something is very wrong
        // so we bail
        if (iterations > 100000 && iterations > match.index * 3) {
          const err = new Error('potential infinite loop, way more iterations than matches');
          throw err;
        }

        /*
        Why might be find ourselves here?  Only one occasion now.  An end match that was
        triggered but could not be completed.  When might this happen?  When an `endSameasBegin`
        rule sets the end rule to a specific match.  Since the overall mode termination rule that's
        being used to scan the text isn't recompiled that means that any match that LOOKS like
        the end (but is not, because it is not an exact match to the beginning) will
        end up here.  A definite end match, but when `doEndMatch` tries to "reapply"
        the end rule and fails to match, we wind up here, and just silently ignore the end.

        This causes no real harm other than stopping a few times too many.
        */

        modeBuffer += lexeme;
        return lexeme.length;
      }

      var language = getLanguage(languageName);
      if (!language) {
        console.error(LANGUAGE_NOT_FOUND.replace("{}", languageName));
        throw new Error('Unknown language: "' + languageName + '"');
      }

      var md = compileLanguage(language);
      var result = '';
      /** @type {CompiledMode} */
      var top = continuation || md;
      /** @type Record<string,Mode> */
      var continuations = {}; // keep continuations for sub-languages
      var emitter = new options.__emitter(options);
      processContinuations();
      var modeBuffer = '';
      var relevance = 0;
      var index = 0;
      var iterations = 0;
      var resumeScanAtSamePosition = false;

      try {
        top.matcher.considerAll();

        for (;;) {
          iterations++;
          if (resumeScanAtSamePosition) {
            // only regexes not matched previously will now be
            // considered for a potential match
            resumeScanAtSamePosition = false;
          } else {
            top.matcher.considerAll();
          }
          top.matcher.lastIndex = index;

          const match = top.matcher.exec(codeToHighlight);
          // console.log("match", match[0], match.rule && match.rule.begin)

          if (!match) break;

          const beforeMatch = codeToHighlight.substring(index, match.index);
          const processedCount = processLexeme(beforeMatch, match);
          index = match.index + processedCount;
        }
        processLexeme(codeToHighlight.substr(index));
        emitter.closeAllNodes();
        emitter.finalize();
        result = emitter.toHTML();

        return {
          relevance: relevance,
          value: result,
          language: languageName,
          illegal: false,
          emitter: emitter,
          top: top
        };
      } catch (err) {
        if (err.message && err.message.includes('Illegal')) {
          return {
            illegal: true,
            illegalBy: {
              msg: err.message,
              context: codeToHighlight.slice(index - 100, index + 100),
              mode: err.mode
            },
            sofar: result,
            relevance: 0,
            value: escape$1(codeToHighlight),
            emitter: emitter
          };
        } else if (SAFE_MODE) {
          return {
            illegal: false,
            relevance: 0,
            value: escape$1(codeToHighlight),
            emitter: emitter,
            language: languageName,
            top: top,
            errorRaised: err
          };
        } else {
          throw err;
        }
      }
    }

    /**
     * returns a valid highlight result, without actually doing any actual work,
     * auto highlight starts with this and it's possible for small snippets that
     * auto-detection may not find a better match
     * @param {string} code
     * @returns {HighlightResult}
     */
    function justTextHighlightResult(code) {
      const result = {
        relevance: 0,
        emitter: new options.__emitter(options),
        value: escape$1(code),
        illegal: false,
        top: PLAINTEXT_LANGUAGE
      };
      result.emitter.addText(code);
      return result;
    }

    /**
    Highlighting with language detection. Accepts a string with the code to
    highlight. Returns an object with the following properties:

    - language (detected language)
    - relevance (int)
    - value (an HTML string with highlighting markup)
    - second_best (object with the same structure for second-best heuristically
      detected language, may be absent)

      @param {string} code
      @param {Array<string>} [languageSubset]
      @returns {AutoHighlightResult}
    */
    function highlightAuto(code, languageSubset) {
      languageSubset = languageSubset || options.languages || Object.keys(languages);
      var result = justTextHighlightResult(code);
      var secondBest = result;
      languageSubset.filter(getLanguage).filter(autoDetection).forEach(function(name) {
        var current = _highlight(name, code, false);
        current.language = name;
        if (current.relevance > secondBest.relevance) {
          secondBest = current;
        }
        if (current.relevance > result.relevance) {
          secondBest = result;
          result = current;
        }
      });
      if (secondBest.language) {
        // second_best (with underscore) is the expected API
        result.second_best = secondBest;
      }
      return result;
    }

    /**
    Post-processing of the highlighted markup:

    - replace TABs with something more useful
    - replace real line-breaks with '<br>' for non-pre containers

      @param {string} html
      @returns {string}
    */
    function fixMarkup(html) {
      if (!(options.tabReplace || options.useBR)) {
        return html;
      }

      return html.replace(fixMarkupRe, match => {
        if (match === '\n') {
          return options.useBR ? '<br>' : match;
        } else if (options.tabReplace) {
          return match.replace(/\t/g, options.tabReplace);
        }
        return match;
      });
    }

    /**
     * Builds new class name for block given the language name
     *
     * @param {string} prevClassName
     * @param {string} [currentLang]
     * @param {string} [resultLang]
     */
    function buildClassName(prevClassName, currentLang, resultLang) {
      var language = currentLang ? aliases[currentLang] : resultLang;
      var result = [prevClassName.trim()];

      if (!prevClassName.match(/\bhljs\b/)) {
        result.push('hljs');
      }

      if (!prevClassName.includes(language)) {
        result.push(language);
      }

      return result.join(' ').trim();
    }

    /**
     * Applies highlighting to a DOM node containing code. Accepts a DOM node and
     * two optional parameters for fixMarkup.
     *
     * @param {HighlightedHTMLElement} element - the HTML element to highlight
    */
    function highlightBlock(element) {
      /** @type HTMLElement */
      let node = null;
      const language = blockLanguage(element);

      if (shouldNotHighlight(language)) return;

      fire("before:highlightBlock",
        { block: element, language: language });

      if (options.useBR) {
        node = document.createElement('div');
        node.innerHTML = element.innerHTML.replace(/\n/g, '').replace(/<br[ /]*>/g, '\n');
      } else {
        node = element;
      }
      const text = node.textContent;
      const result = language ? highlight(language, text, true) : highlightAuto(text);

      const originalStream = nodeStream$1(node);
      if (originalStream.length) {
        const resultNode = document.createElement('div');
        resultNode.innerHTML = result.value;
        result.value = mergeStreams$1(originalStream, nodeStream$1(resultNode), text);
      }
      result.value = fixMarkup(result.value);

      fire("after:highlightBlock", { block: element, result: result });

      element.innerHTML = result.value;
      element.className = buildClassName(element.className, language, result.language);
      element.result = {
        language: result.language,
        // TODO: remove with version 11.0
        re: result.relevance,
        relavance: result.relevance
      };
      if (result.second_best) {
        element.second_best = {
          language: result.second_best.language,
          // TODO: remove with version 11.0
          re: result.second_best.relevance,
          relavance: result.second_best.relevance
        };
      }
    }

    /**
     * Updates highlight.js global options with the passed options
     *
     * @param {{}} userOptions
     */
    function configure(userOptions) {
      if (userOptions.useBR) {
        console.warn("'useBR' option is deprecated and will be removed entirely in v11.0");
        console.warn("Please see https://github.com/highlightjs/highlight.js/issues/2559");
      }
      options = inherit$1(options, userOptions);
    }

    /**
     * Highlights to all <pre><code> blocks on a page
     *
     * @type {Function & {called?: boolean}}
     */
    const initHighlighting = () => {
      if (initHighlighting.called) return;
      initHighlighting.called = true;

      var blocks = document.querySelectorAll('pre code');
      ArrayProto.forEach.call(blocks, highlightBlock);
    };

    // Higlights all when DOMContentLoaded fires
    function initHighlightingOnLoad() {
      // @ts-ignore
      window.addEventListener('DOMContentLoaded', initHighlighting, false);
    }

    /**
     * Register a language grammar module
     *
     * @param {string} languageName
     * @param {LanguageFn} languageDefinition
     */
    function registerLanguage(languageName, languageDefinition) {
      var lang = null;
      try {
        lang = languageDefinition(hljs);
      } catch (error) {
        console.error("Language definition for '{}' could not be registered.".replace("{}", languageName));
        // hard or soft error
        if (!SAFE_MODE) { throw error; } else { console.error(error); }
        // languages that have serious errors are replaced with essentially a
        // "plaintext" stand-in so that the code blocks will still get normal
        // css classes applied to them - and one bad language won't break the
        // entire highlighter
        lang = PLAINTEXT_LANGUAGE;
      }
      // give it a temporary name if it doesn't have one in the meta-data
      if (!lang.name) lang.name = languageName;
      languages[languageName] = lang;
      lang.rawDefinition = languageDefinition.bind(null, hljs);

      if (lang.aliases) {
        registerAliases(lang.aliases, { languageName });
      }
    }

    /**
     * @returns {string[]} List of language internal names
     */
    function listLanguages() {
      return Object.keys(languages);
    }

    /**
      intended usage: When one language truly requires another

      Unlike `getLanguage`, this will throw when the requested language
      is not available.

      @param {string} name - name of the language to fetch/require
      @returns {Language | never}
    */
    function requireLanguage(name) {
      var lang = getLanguage(name);
      if (lang) { return lang; }

      var err = new Error('The \'{}\' language is required, but not loaded.'.replace('{}', name));
      throw err;
    }

    /**
     * @param {string} name - name of the language to retrieve
     * @returns {Language | undefined}
     */
    function getLanguage(name) {
      name = (name || '').toLowerCase();
      return languages[name] || languages[aliases[name]];
    }

    /**
     *
     * @param {string|string[]} aliasList - single alias or list of aliases
     * @param {{languageName: string}} opts
     */
    function registerAliases(aliasList, { languageName }) {
      if (typeof aliasList === 'string') {
        aliasList = [aliasList];
      }
      aliasList.forEach(alias => { aliases[alias] = languageName; });
    }

    /**
     * Determines if a given language has auto-detection enabled
     * @param {string} name - name of the language
     */
    function autoDetection(name) {
      var lang = getLanguage(name);
      return lang && !lang.disableAutodetect;
    }

    /**
     * @param {HLJSPlugin} plugin
     */
    function addPlugin(plugin) {
      plugins.push(plugin);
    }

    /**
     *
     * @param {PluginEvent} event
     * @param {any} args
     */
    function fire(event, args) {
      var cb = event;
      plugins.forEach(function(plugin) {
        if (plugin[cb]) {
          plugin[cb](args);
        }
      });
    }

    /**
    Note: fixMarkup is deprecated and will be removed entirely in v11

    @param {string} arg
    @returns {string}
    */
    function deprecateFixMarkup(arg) {
      console.warn("fixMarkup is deprecated and will be removed entirely in v11.0");
      console.warn("Please see https://github.com/highlightjs/highlight.js/issues/2534");

      return fixMarkup(arg);
    }

    /* Interface definition */
    Object.assign(hljs, {
      highlight,
      highlightAuto,
      fixMarkup: deprecateFixMarkup,
      highlightBlock,
      configure,
      initHighlighting,
      initHighlightingOnLoad,
      registerLanguage,
      listLanguages,
      getLanguage,
      registerAliases,
      requireLanguage,
      autoDetection,
      inherit: inherit$1,
      addPlugin,
      // plugins for frameworks
      vuePlugin: VuePlugin
    });

    hljs.debugMode = function() { SAFE_MODE = false; };
    hljs.safeMode = function() { SAFE_MODE = true; };
    hljs.versionString = version;

    for (const key in MODES) {
      // @ts-ignore
      if (typeof MODES[key] === "object") {
        // @ts-ignore
        deepFreeze(MODES[key]);
      }
    }

    // merge all the modes/regexs into our main object
    Object.assign(hljs, MODES);

    return hljs;
  };

  // export an "instance" of the highlighter
  var highlight = HLJS({});

  return highlight;

}());
if (typeof exports === 'object' && typeof module !== 'undefined') { module.exports = hljs; }

hljs.registerLanguage('julia', function () {
  'use strict';

  /*
  Language: Julia
  Description: Julia is a high-level, high-performance, dynamic programming language.
  Author: Kenta Sato <bicycle1885@gmail.com>
  Contributors: Alex Arslan <ararslan@comcast.net>, Fredrik Ekre <ekrefredrik@gmail.com>
  Website: https://julialang.org
  */

  function julia(hljs) {
    // Since there are numerous special names in Julia, it is too much trouble
    // to maintain them by hand. Hence these names (i.e. keywords, literals and
    // built-ins) are automatically generated from Julia 1.5.2 itself through
    // the following scripts for each.

    // ref: https://docs.julialang.org/en/v1/manual/variables/#Allowed-Variable-Names
    var VARIABLE_NAME_RE = '(?:[A-Za-z_\\u00A1-\\uFFFF][A-Za-z_0-9\\u00A1-\\uFFFF!]*)';

    // # keyword generator, multi-word keywords handled manually below (Julia 1.5.2)
    // import REPL.REPLCompletions
    // res = String["in", "isa", "where"]
    // for kw in collect(x.keyword for x in REPLCompletions.complete_keyword(""))
    //     if !(contains(kw, " ") || kw == "struct")
    //         push!(res, kw)
    //     end
    // end
    // sort!(unique!(res))
    // foreach(x -> println("\'", x, "\',"), res)
    var KEYWORD_LIST = [
      'baremodule',
      'begin',
      'break',
      'catch',
      'ccall',
      'const',
      'continue',
      'do',
      'else',
      'elseif',
      'end',
      'export',
      'false',
      'finally',
      'for',
      'function',
      'global',
      'if',
      'import',
      'in',
      'isa',
      'let',
      'local',
      'macro',
      'module',
      'quote',
      'return',
      'true',
      'try',
      'using',
      'where',
      'while',
    ];

    // # literal generator (Julia 1.5.2)
    // import REPL.REPLCompletions
    // res = String["true", "false"]
    // for compl in filter!(x -> isa(x, REPLCompletions.ModuleCompletion) && (x.parent === Base || x.parent === Core),
    //                     REPLCompletions.completions("", 0)[1])
    //     try
    //         v = eval(Symbol(compl.mod))
    //         if !(v isa Function || v isa Type || v isa TypeVar || v isa Module || v isa Colon)
    //             push!(res, compl.mod)
    //         end
    //     catch e
    //     end
    // end
    // sort!(unique!(res))
    // foreach(x -> println("\'", x, "\',"), res)
    var LITERAL_LIST = [
      'ARGS',
      'C_NULL',
      'DEPOT_PATH',
      'ENDIAN_BOM',
      'ENV',
      'Inf',
      'Inf16',
      'Inf32',
      'Inf64',
      'InsertionSort',
      'LOAD_PATH',
      'MergeSort',
      'NaN',
      'NaN16',
      'NaN32',
      'NaN64',
      'PROGRAM_FILE',
      'QuickSort',
      'RoundDown',
      'RoundFromZero',
      'RoundNearest',
      'RoundNearestTiesAway',
      'RoundNearestTiesUp',
      'RoundToZero',
      'RoundUp',
      'VERSION|0',
      'devnull',
      'false',
      'im',
      'missing',
      'nothing',
      'pi',
      'stderr',
      'stdin',
      'stdout',
      'true',
      'undef',
      'π',
      'ℯ',
    ];

    // # built_in generator (Julia 1.5.2)
    // import REPL.REPLCompletions
    // res = String[]
    // for compl in filter!(x -> isa(x, REPLCompletions.ModuleCompletion) && (x.parent === Base || x.parent === Core),
    //                     REPLCompletions.completions("", 0)[1])
    //     try
    //         v = eval(Symbol(compl.mod))
    //         if (v isa Type || v isa TypeVar) && (compl.mod != "=>")
    //             push!(res, compl.mod)
    //         end
    //     catch e
    //     end
    // end
    // sort!(unique!(res))
    // foreach(x -> println("\'", x, "\',"), res)
    var BUILT_IN_LIST = [
      'AbstractArray',
      'AbstractChannel',
      'AbstractChar',
      'AbstractDict',
      'AbstractDisplay',
      'AbstractFloat',
      'AbstractIrrational',
      'AbstractMatrix',
      'AbstractRange',
      'AbstractSet',
      'AbstractString',
      'AbstractUnitRange',
      'AbstractVecOrMat',
      'AbstractVector',
      'Any',
      'ArgumentError',
      'Array',
      'AssertionError',
      'BigFloat',
      'BigInt',
      'BitArray',
      'BitMatrix',
      'BitSet',
      'BitVector',
      'Bool',
      'BoundsError',
      'CapturedException',
      'CartesianIndex',
      'CartesianIndices',
      'Cchar',
      'Cdouble',
      'Cfloat',
      'Channel',
      'Char',
      'Cint',
      'Cintmax_t',
      'Clong',
      'Clonglong',
      'Cmd',
      'Colon',
      'Complex',
      'ComplexF16',
      'ComplexF32',
      'ComplexF64',
      'CompositeException',
      'Condition',
      'Cptrdiff_t',
      'Cshort',
      'Csize_t',
      'Cssize_t',
      'Cstring',
      'Cuchar',
      'Cuint',
      'Cuintmax_t',
      'Culong',
      'Culonglong',
      'Cushort',
      'Cvoid',
      'Cwchar_t',
      'Cwstring',
      'DataType',
      'DenseArray',
      'DenseMatrix',
      'DenseVecOrMat',
      'DenseVector',
      'Dict',
      'DimensionMismatch',
      'Dims',
      'DivideError',
      'DomainError',
      'EOFError',
      'Enum',
      'ErrorException',
      'Exception',
      'ExponentialBackOff',
      'Expr',
      'Float16',
      'Float32',
      'Float64',
      'Function',
      'GlobalRef',
      'HTML',
      'IO',
      'IOBuffer',
      'IOContext',
      'IOStream',
      'IdDict',
      'IndexCartesian',
      'IndexLinear',
      'IndexStyle',
      'InexactError',
      'InitError',
      'Int',
      'Int128',
      'Int16',
      'Int32',
      'Int64',
      'Int8',
      'Integer',
      'InterruptException',
      'InvalidStateException',
      'Irrational',
      'KeyError',
      'LinRange',
      'LineNumberNode',
      'LinearIndices',
      'LoadError',
      'MIME',
      'Matrix',
      'Method',
      'MethodError',
      'Missing',
      'MissingException',
      'Module',
      'NTuple',
      'NamedTuple',
      'Nothing',
      'Number',
      'OrdinalRange',
      'OutOfMemoryError',
      'OverflowError',
      'Pair',
      'PartialQuickSort',
      'PermutedDimsArray',
      'Pipe',
      'ProcessFailedException',
      'Ptr',
      'QuoteNode',
      'Rational',
      'RawFD',
      'ReadOnlyMemoryError',
      'Real',
      'ReentrantLock',
      'Ref',
      'Regex',
      'RegexMatch',
      'RoundingMode',
      'SegmentationFault',
      'Set',
      'Signed',
      'Some',
      'StackOverflowError',
      'StepRange',
      'StepRangeLen',
      'StridedArray',
      'StridedMatrix',
      'StridedVecOrMat',
      'StridedVector',
      'String',
      'StringIndexError',
      'SubArray',
      'SubString',
      'SubstitutionString',
      'Symbol',
      'SystemError',
      'Task',
      'TaskFailedException',
      'Text',
      'TextDisplay',
      'Timer',
      'Tuple',
      'Type',
      'TypeError',
      'TypeVar',
      'UInt',
      'UInt128',
      'UInt16',
      'UInt32',
      'UInt64',
      'UInt8',
      'UndefInitializer',
      'UndefKeywordError',
      'UndefRefError',
      'UndefVarError',
      'Union',
      'UnionAll',
      'UnitRange',
      'Unsigned',
      'Val',
      'Vararg',
      'VecElement',
      'VecOrMat',
      'Vector',
      'VersionNumber',
      'WeakKeyDict',
      'WeakRef',
    ];

    var KEYWORDS = {
      $pattern: VARIABLE_NAME_RE,
      keyword: KEYWORD_LIST.join(" "),
      literal: LITERAL_LIST.join(" "),
      type: BUILT_IN_LIST.join(" "),
    };

    // placeholder for recursive self-reference
    var DEFAULT = {
      keywords: KEYWORDS, illegal: /<\//
    };

    // ref: https://docs.julialang.org/en/v1/manual/integers-and-floating-point-numbers/
    var NUMBER = {
      className: 'number',
      // supported numeric literals:
      //  * binary literal (e.g. 0x10)
      //  * octal literal (e.g. 0o76543210)
      //  * hexadecimal literal (e.g. 0xfedcba876543210)
      //  * hexadecimal floating point literal (e.g. 0x1p0, 0x1.2p2)
      //  * decimal literal (e.g. 9876543210, 100_000_000)
      //  * floating point literal (e.g. 1.2, 1.2f, .2, 1., 1.2e10, 1.2e-10)
      begin: /(\b0x[\d_]*(\.[\d_]*)?|0x\.\d[\d_]*)p[-+]?\d+|\b0[box][a-fA-F0-9][a-fA-F0-9_]*|(\b\d[\d_]*(\.[\d_]*)?|\.\d[\d_]*)([eEfF][-+]?\d+)?/,
      relevance: 0
    };

    // Assignment and control-flow operators && and ||
    var KEYWORDLIKE_OPERATORS = {
      className: 'keyword',
      begin: '&&|\\|\\||=',
    };

    var BUILTIN_OPERATORS = {
      className: 'built_in',
      variants: [
        // Multi-character operators
        {begin: '::|<:|>:|[=!]?==|[<>!]=|//|=>|\\/\\/|<<|>>>|>>|->'},
        // Unicode operators (https://github.com/JuliaLang/julia/blob/master/src/julia-parser.scm)
        {begin: /[≤≥¬←→↔↚↛↠↣↦↮⇎⇏⇒⇔⇴⇶⇷⇸⇹⇺⇻⇼⇽⇾⇿⟵⟶⟷⟷⟹⟺⟻⟼⟽⟾⟿⤀⤁⤂⤃⤄⤅⤆⤇⤌⤍⤎⤏⤐⤑⤔⤕⤖⤗⤘⤝⤞⤟⤠⥄⥅⥆⥇⥈⥊⥋⥎⥐⥒⥓⥖⥗⥚⥛⥞⥟⥢⥤⥦⥧⥨⥩⥪⥫⥬⥭⥰⧴⬱⬰⬲⬳⬴⬵⬶⬷⬸⬹⬺⬻⬼⬽⬾⬿⭀⭁⭂⭃⭄⭇⭈⭉⭊⭋⭌￩￫≡≠≢∈∉∋∌⊆⊈⊂⊄⊊∝∊∍∥∦∷∺∻∽∾≁≃≄≅≆≇≈≉≊≋≌≍≎≐≑≒≓≔≕≖≗≘≙≚≛≜≝≞≟≣≦≧≨≩≪≫≬≭≮≯≰≱≲≳≴≵≶≷≸≹≺≻≼≽≾≿⊀⊁⊃⊅⊇⊉⊋⊏⊐⊑⊒⊜⊩⊬⊮⊰⊱⊲⊳⊴⊵⊶⊷⋍⋐⋑⋕⋖⋗⋘⋙⋚⋛⋜⋝⋞⋟⋠⋡⋢⋣⋤⋥⋦⋧⋨⋩⋪⋫⋬⋭⋲⋳⋴⋵⋶⋷⋸⋹⋺⋻⋼⋽⋾⋿⟈⟉⟒⦷⧀⧁⧡⧣⧤⧥⩦⩧⩪⩫⩬⩭⩮⩯⩰⩱⩲⩳⩴⩵⩶⩷⩸⩹⩺⩻⩼⩽⩾⩿⪀⪁⪂⪃⪄⪅⪆⪇⪈⪉⪊⪋⪌⪍⪎⪏⪐⪑⪒⪓⪔⪕⪖⪗⪘⪙⪚⪛⪜⪝⪞⪟⪠⪡⪢⪣⪤⪥⪦⪧⪨⪩⪪⪫⪬⪭⪮⪯⪰⪱⪲⪳⪴⪵⪶⪷⪸⪹⪺⪻⪼⪽⪾⪿⫀⫁⫂⫃⫄⫅⫆⫇⫈⫉⫊⫋⫌⫍⫎⫏⫐⫑⫒⫓⫔⫕⫖⫗⫘⫙⫷⫸⫹⫺⊢⊣⊕⊖⊞⊟∪∨⊔±∓∔∸≂≏⊎⊻⊽⋎⋓⧺⧻⨈⨢⨣⨤⨥⨦⨧⨨⨩⨪⨫⨬⨭⨮⨹⨺⩁⩂⩅⩊⩌⩏⩐⩒⩔⩖⩗⩛⩝⩡⩢⩣÷⋅∘×∩∧⊗⊘⊙⊚⊛⊠⊡⊓∗∙∤⅋≀⊼⋄⋆⋇⋉⋊⋋⋌⋏⋒⟑⦸⦼⦾⦿⧶⧷⨇⨰⨱⨲⨳⨴⨵⨶⨷⨸⨻⨼⨽⩀⩃⩄⩋⩍⩎⩑⩓⩕⩘⩚⩜⩞⩟⩠⫛⊍▷⨝⟕⟖⟗↑↓⇵⟰⟱⤈⤉⤊⤋⤒⤓⥉⥌⥍⥏⥑⥔⥕⥘⥙⥜⥝⥠⥡⥣⥥⥮⥯￪￬]/},
        // ASCII operators
        {begin: /[-+*/\\^:<>~?$%.]/},
        // | and & (unless they are really || and && in disguise)
        {begin: '&(?!&)|\\|(?!\\|)'},
        // ! is an operator unless it is used in a variable
        {begin: '(?<!' + VARIABLE_NAME_RE + ')!'}
      ]
    };

    // Match for types in unambiguous contexts, such as ::T, <:T etc.
    var TYPE_CONTEXT = {
      className: 'type',
      variants: [
        // Match Base in Base.Union{...}
        {begin: VARIABLE_NAME_RE + '(?=\\.' + VARIABLE_NAME_RE + '{)', end: '}'},
        // Match Union{...}
        {begin: VARIABLE_NAME_RE + '{', end: '}'},
        // Match T in e.g. ::Q.T, S<:Q.T, S>:Q.T
        {begin: '(?<=[<>:]:\\s?' + VARIABLE_NAME_RE + '\\.)' + VARIABLE_NAME_RE},
        // Match T in e.g. ::T, S<:T, S>:T
        {begin: '(?<=[<>:]:\\s?)' + VARIABLE_NAME_RE},
        // Match S in e.g. S.Q<:T, S.Q>:T
        {begin: VARIABLE_NAME_RE + '(?=\\.' + VARIABLE_NAME_RE + '\\s?[<>]:)'},
        // Match S in e.g. S<:T, S>:T
        {begin: VARIABLE_NAME_RE + '(?=\\s?[<>]:)'},
      ],
      contains: [
        BUILTIN_OPERATORS,
        KEYWORDLIKE_OPERATORS,
        'self',
      ]
    };

    // Match where ... constructs
    var WHERE_CLAUSE = {
      className: '',
      variants: [
        // Match where {...}
        {begin: '(?<=where\\s+){' + '', end: '}', excludeBegin:true, excludeEnd:true},
        // Match where T
        {className: 'type', begin: '(?<=where\\s+)' + VARIABLE_NAME_RE},
      ],
      contains: [
        TYPE_CONTEXT,
        BUILTIN_OPERATORS,
        KEYWORDLIKE_OPERATORS,
        // Match single identifier, e.g. where {T}
        {begin: VARIABLE_NAME_RE, className:'type'}
      ]
    };

    var CHAR = {
      className: 'string',
      variants: [
        {begin: /'(.|\\[xXuU][a-zA-Z0-9]+)'/},
        {begin: /'\\[rn\\$]'/},
      ]
    };

    var INTERPOLATION = {
      className: 'subst',
      begin: /\$\(/, end: /\)/,
      keywords: KEYWORDS
    };

    var INTERPOLATED_VARIABLE = {
      className: 'variable',
      begin: '\\$' + VARIABLE_NAME_RE
    };

    // Literal String, Regex and Cmd strings
    // TODO: neatly escape normal code in string literal
    // TODO: mark docstrings as doctag
    var STRING_REGEX_CMD = {
      className: 'string',
      contains: [hljs.BACKSLASH_ESCAPE, INTERPOLATION, INTERPOLATED_VARIABLE],
      variants: [
        { begin: /r"""/, end: /"""\w*/, relevance: 10, className: 'regexp', contains: [hljs.BACKSLASH_ESCAPE] },
        { begin: /\w*"""/, end: /"""\w*/, relevance: 10 },
        { begin: '```', end: '```' },
        { begin: /r"/, end: /"\w*/, className: 'regexp', contains: [hljs.BACKSLASH_ESCAPE] },
        { begin: /\w*"/, end: /"\w*/ },
        { begin: '`', end: '`'},
      ]
    };

    // Conservative matching of symbol as identifier after :, unless there is a
    // valid identifier/number just before; e.g. a:b, 1:b is not a symbol
    var SYMBOL = {
      className: 'symbol',
      begin: '(?<!(' + VARIABLE_NAME_RE + '|[\\d\\.]+|[:<>]+)\\s*)(:' + VARIABLE_NAME_RE + ')',
    };

    var MACROCALL = {
      className: 'meta',
      begin: '@' + VARIABLE_NAME_RE
    };

    // Useful group of "atoms" used later
    var ATOMS = [
      NUMBER,
      CHAR,
      STRING_REGEX_CMD,
      SYMBOL,
      MACROCALL
    ];

    var COMMENT = {
      className: 'comment',
      variants: [
        { begin: '#=', end: '=#', relevance: 10 },
        { begin: '#', end: '$' }
      ]
    };


    var FUNCTION_CALL = {
      className: '',
      // Match fun(... and fun.(...
      begin: '(\\b' + VARIABLE_NAME_RE + '({.*?}|\\.)?\\()',
      end: '\\)',
      returnBegin:true,
      keywords: KEYWORDS,
      contains: [
        // Cheating a bit -- not all functions are builtins, but who cares in julia!
        {begin:'\\b(ccall|new({.*?})?)(?=\\()', className: 'keyword'}, // Non-standard functions
        {begin:'\\b' + VARIABLE_NAME_RE + '({.*?})?(?=\\.?\\()', className: 'built_in'},
        ...ATOMS,
        'self',
        TYPE_CONTEXT,
        BUILTIN_OPERATORS,
        KEYWORDLIKE_OPERATORS,
      ]
    };

    var FUNCTION_DEFINITION_PARAMETERS = {
      begin: '(?<=' + VARIABLE_NAME_RE + '({.*?})?)\\(',
      end: '\\)',
      className: '',
      keywords: KEYWORDS,
      contains: [
        ...ATOMS,
        TYPE_CONTEXT,
        FUNCTION_CALL,
        BUILTIN_OPERATORS,
        KEYWORDLIKE_OPERATORS,
        {begin: '(?<!=\\s?)\\b' + VARIABLE_NAME_RE + '\\b', className: 'params'},
      ]
    };

    var FUNCTION_DEFINITION = {
      className: '',
      begin: '\\bfunction[ \\t]+' + '(' + VARIABLE_NAME_RE + '\\.)*' + VARIABLE_NAME_RE + '({.*})?\\(.*\\)([ \\t]+where\\s+({.*?}|' + VARIABLE_NAME_RE + '([ \\t]+[<>]:\\s+' + VARIABLE_NAME_RE + '({.*})?)?))*',
      returnBegin:true,
      contains: [
          // Function keyword
          {begin: '\\bfunction\\s', className: 'keyword'},
          // Skip over leading A.B.
          {begin: '(' + VARIABLE_NAME_RE + ')(?=\\.)', end: '(?=' + VARIABLE_NAME_RE+'({.*?})?\\()', contains:[
            {begin: '\\.', className: 'built_in'}
          ]},
          // Function name
          {begin: VARIABLE_NAME_RE + '({.*?})?(?=\\()', className: 'title'},
          // Parameters
          FUNCTION_DEFINITION_PARAMETERS,
          // Possibly where-clauses
          WHERE_CLAUSE,
      ]
    };

    var SHORT_FUNCTION_DEFINITION = {
      className: '',
      begin: VARIABLE_NAME_RE + '\\(.*\\)(\\s+where.*?)?\\s*(?==)',
      returnBegin:true,
      contains: [
          {begin: VARIABLE_NAME_RE + '(?=\\()', className: 'title'},
          FUNCTION_DEFINITION_PARAMETERS,
          WHERE_CLAUSE
      ]
    };

    var TYPEDEF = {
      className: 'class',
      variants: [
        { begin: '(?<=primitive[ \\t]+type[ \\t]+)' + VARIABLE_NAME_RE },
        { begin: '(?<=abstract[ \\t]+type[ \\t]+)' + VARIABLE_NAME_RE + '({.*?})?' },
        { begin: '(?<=(mutable[ \\t]+)?struct[ \\t]+)' + VARIABLE_NAME_RE + '({.*?})?' },
      ]
    };

    DEFAULT.name = 'Julia';
    DEFAULT.contains = [
      ...ATOMS,
      FUNCTION_DEFINITION,
      SHORT_FUNCTION_DEFINITION,
      FUNCTION_CALL,
      TYPEDEF,
      WHERE_CLAUSE,
      TYPE_CONTEXT,
      COMMENT,
      hljs.HASH_COMMENT_MODE,
      {
        className: 'keyword',
        begin:
          '\\b(((abstract|primitive)[ \\t]+)type|(mutable[ \\t]+)?struct)\\b'
      },
      BUILTIN_OPERATORS,
      KEYWORDLIKE_OPERATORS,
      {begin: /<:/}  // relevance booster
    ];
    INTERPOLATION.contains = DEFAULT.contains;

    return DEFAULT;
  }

  return julia;

  return module.exports.definer || module.exports;

}());

hljs.registerLanguage('julia-repl', function () {
  'use strict';

  /*
  Language: Julia REPL
  Description: Julia REPL sessions
  Author: Morten Piibeleht <morten.piibeleht@gmail.com>
  Website: https://julialang.org
  Requires: julia.js

  The Julia REPL code blocks look something like the following:

    julia> function foo(x)
               x + 1
           end
    foo (generic function with 1 method)

  They start on a new line with "julia>". Usually there should also be a space after this, but
  we also allow the code to start right after the > character. The code may run over multiple
  lines, but the additional lines must start with six spaces (i.e. be indented to match
  "julia>"). The rest of the code is assumed to be output from the executed code and will be
  left un-highlighted.

  Using simply spaces to identify line continuations may get a false-positive if the output
  also prints out six spaces, but such cases should be rare.
  */

  function juliaRepl(hljs) {
    return {
      name: 'Julia REPL',
      contains: [
        {
          className: 'meta',
          begin: /^julia>/,
          relevance: 10,
          starts: {
            // end the highlighting if we are on a new line and the line does not have at
            // least six spaces in the beginning
            end: /^(?![ ]{6})/,
            subLanguage: 'julia'
        },
        // jldoctest Markdown blocks are used in the Julia manual and package docs indicate
        // code snippets that should be verified when the documentation is built. They can be
        // either REPL-like or script-like, but are usually REPL-like and therefore we apply
        // julia-repl highlighting to them. More information can be found in Documenter's
        // manual: https://juliadocs.github.io/Documenter.jl/latest/man/doctests.html
        aliases: ['jldoctest']
        }
      ]
    }
  }

  return juliaRepl;

  return module.exports.definer || module.exports;

}());

hljs.registerLanguage('c-like', function () {
  'use strict';

  /*
  Language: C-like foundation grammar for C/C++ grammars
  Author: Ivan Sagalaev <maniac@softwaremaniacs.org>
  Contributors: Evgeny Stepanischev <imbolk@gmail.com>, Zaven Muradyan <megalivoithos@gmail.com>, Roel Deckers <admin@codingcat.nl>, Sam Wu <samsam2310@gmail.com>, Jordi Petit <jordi.petit@gmail.com>, Pieter Vantorre <pietervantorre@gmail.com>, Google Inc. (David Benjamin) <davidben@google.com>
  Category: common, system
  */

  /* In the future the intention is to split out the C/C++ grammars distinctly
  since they are separate languages.  They will likely share a common foundation
  though, and this file sets the groundwork for that - so that we get the breaking
  change in v10 and don't have to change the requirements again later.

  See: https://github.com/highlightjs/highlight.js/issues/2146
  */

  /** @type LanguageFn */
  function cLike(hljs) {
    function optional(s) {
      return '(?:' + s + ')?';
    }
    // added for historic reasons because `hljs.C_LINE_COMMENT_MODE` does 
    // not include such support nor can we be sure all the grammars depending
    // on it would desire this behavior
    var C_LINE_COMMENT_MODE = hljs.COMMENT('//', '$', {
      contains: [{begin: /\\\n/}]
    });
    var DECLTYPE_AUTO_RE = 'decltype\\(auto\\)';
    var NAMESPACE_RE = '[a-zA-Z_]\\w*::';
    var TEMPLATE_ARGUMENT_RE = '<.*?>';
    var FUNCTION_TYPE_RE = '(' +
      DECLTYPE_AUTO_RE + '|' +
      optional(NAMESPACE_RE) +'[a-zA-Z_]\\w*' + optional(TEMPLATE_ARGUMENT_RE) +
    ')';
    var CPP_PRIMITIVE_TYPES = {
      className: 'keyword',
      begin: '\\b[a-z\\d_]*_t\\b'
    };

    // https://en.cppreference.com/w/cpp/language/escape
    // \\ \x \xFF \u2837 \u00323747 \374
    var CHARACTER_ESCAPES = '\\\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4,8}|[0-7]{3}|\\S)';
    var STRINGS = {
      className: 'string',
      variants: [
        {
          begin: '(u8?|U|L)?"', end: '"',
          illegal: '\\n',
          contains: [hljs.BACKSLASH_ESCAPE]
        },
        {
          begin: '(u8?|U|L)?\'(' + CHARACTER_ESCAPES + "|.)", end: '\'',
          illegal: '.'
        },
        hljs.END_SAME_AS_BEGIN({
          begin: /(?:u8?|U|L)?R"([^()\\ ]{0,16})\(/,
          end: /\)([^()\\ ]{0,16})"/,
        })
      ]
    };

    var NUMBERS = {
      className: 'number',
      variants: [
        { begin: '\\b(0b[01\']+)' },
        { begin: '(-?)\\b([\\d\']+(\\.[\\d\']*)?|\\.[\\d\']+)(u|U|l|L|ul|UL|f|F|b|B)' },
        { begin: '(-?)(\\b0[xX][a-fA-F0-9\']+|(\\b[\\d\']+(\\.[\\d\']*)?|\\.[\\d\']+)([eE][-+]?[\\d\']+)?)' }
      ],
      relevance: 0
    };

    var PREPROCESSOR =       {
      className: 'meta',
      begin: /#\s*[a-z]+\b/, end: /$/,
      keywords: {
        'meta-keyword':
          'if else elif endif define undef warning error line ' +
          'pragma _Pragma ifdef ifndef include'
      },
      contains: [
        {
          begin: /\\\n/, relevance: 0
        },
        hljs.inherit(STRINGS, {className: 'meta-string'}),
        {
          className: 'meta-string',
          begin: /<.*?>/, end: /$/,
          illegal: '\\n',
        },
        C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE
      ]
    };

    var TITLE_MODE = {
      className: 'title',
      begin: optional(NAMESPACE_RE) + hljs.IDENT_RE,
      relevance: 0
    };

    var FUNCTION_TITLE = optional(NAMESPACE_RE) + hljs.IDENT_RE + '\\s*\\(';

    var CPP_KEYWORDS = {
      keyword: 'int float while private char char8_t char16_t char32_t catch import module export virtual operator sizeof ' +
        'dynamic_cast|10 typedef const_cast|10 const for static_cast|10 union namespace ' +
        'unsigned long volatile static protected bool template mutable if public friend ' +
        'do goto auto void enum else break extern using asm case typeid wchar_t ' +
        'short reinterpret_cast|10 default double register explicit signed typename try this ' +
        'switch continue inline delete alignas alignof constexpr consteval constinit decltype ' +
        'concept co_await co_return co_yield requires ' +
        'noexcept static_assert thread_local restrict final override ' +
        'atomic_bool atomic_char atomic_schar ' +
        'atomic_uchar atomic_short atomic_ushort atomic_int atomic_uint atomic_long atomic_ulong atomic_llong ' +
        'atomic_ullong new throw return ' +
        'and and_eq bitand bitor compl not not_eq or or_eq xor xor_eq',
      built_in: 'std string wstring cin cout cerr clog stdin stdout stderr stringstream istringstream ostringstream ' +
        'auto_ptr deque list queue stack vector map set pair bitset multiset multimap unordered_set ' +
        'unordered_map unordered_multiset unordered_multimap priority_queue make_pair array shared_ptr abort terminate abs acos ' +
        'asin atan2 atan calloc ceil cosh cos exit exp fabs floor fmod fprintf fputs free frexp ' +
        'fscanf future isalnum isalpha iscntrl isdigit isgraph islower isprint ispunct isspace isupper ' +
        'isxdigit tolower toupper labs ldexp log10 log malloc realloc memchr memcmp memcpy memset modf pow ' +
        'printf putchar puts scanf sinh sin snprintf sprintf sqrt sscanf strcat strchr strcmp ' +
        'strcpy strcspn strlen strncat strncmp strncpy strpbrk strrchr strspn strstr tanh tan ' +
        'vfprintf vprintf vsprintf endl initializer_list unique_ptr _Bool complex _Complex imaginary _Imaginary',
      literal: 'true false nullptr NULL'
    };

    var EXPRESSION_CONTAINS = [
      PREPROCESSOR,
      CPP_PRIMITIVE_TYPES,
      C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      NUMBERS,
      STRINGS
    ];

    var EXPRESSION_CONTEXT = {
      // This mode covers expression context where we can't expect a function
      // definition and shouldn't highlight anything that looks like one:
      // `return some()`, `else if()`, `(x*sum(1, 2))`
      variants: [
        {begin: /=/, end: /;/},
        {begin: /\(/, end: /\)/},
        {beginKeywords: 'new throw return else', end: /;/}
      ],
      keywords: CPP_KEYWORDS,
      contains: EXPRESSION_CONTAINS.concat([
        {
          begin: /\(/, end: /\)/,
          keywords: CPP_KEYWORDS,
          contains: EXPRESSION_CONTAINS.concat(['self']),
          relevance: 0
        }
      ]),
      relevance: 0
    };

    var FUNCTION_DECLARATION = {
      className: 'function',
      begin: '(' + FUNCTION_TYPE_RE + '[\\*&\\s]+)+' + FUNCTION_TITLE,
      returnBegin: true, end: /[{;=]/,
      excludeEnd: true,
      keywords: CPP_KEYWORDS,
      illegal: /[^\w\s\*&:<>]/,
      contains: [

        { // to prevent it from being confused as the function title
          begin: DECLTYPE_AUTO_RE,
          keywords: CPP_KEYWORDS,
          relevance: 0,
        },
        {
          begin: FUNCTION_TITLE, returnBegin: true,
          contains: [TITLE_MODE],
          relevance: 0
        },
        {
          className: 'params',
          begin: /\(/, end: /\)/,
          keywords: CPP_KEYWORDS,
          relevance: 0,
          contains: [
            C_LINE_COMMENT_MODE,
            hljs.C_BLOCK_COMMENT_MODE,
            STRINGS,
            NUMBERS,
            CPP_PRIMITIVE_TYPES,
            // Count matching parentheses.
            {
              begin: /\(/, end: /\)/,
              keywords: CPP_KEYWORDS,
              relevance: 0,
              contains: [
                'self',
                C_LINE_COMMENT_MODE,
                hljs.C_BLOCK_COMMENT_MODE,
                STRINGS,
                NUMBERS,
                CPP_PRIMITIVE_TYPES
              ]
            }
          ]
        },
        CPP_PRIMITIVE_TYPES,
        C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE,
        PREPROCESSOR
      ]
    };

    return {
      aliases: ['c', 'cc', 'h', 'c++', 'h++', 'hpp', 'hh', 'hxx', 'cxx'],
      keywords: CPP_KEYWORDS,
      // the base c-like language will NEVER be auto-detected, rather the
      // derivitives: c, c++, arduino turn auto-detect back on for themselves
      disableAutodetect: true,
      illegal: '</',
      contains: [].concat(
        EXPRESSION_CONTEXT,
        FUNCTION_DECLARATION,
        EXPRESSION_CONTAINS,
        [
        PREPROCESSOR,
        { // containers: ie, `vector <int> rooms (9);`
          begin: '\\b(deque|list|queue|priority_queue|pair|stack|vector|map|set|bitset|multiset|multimap|unordered_map|unordered_set|unordered_multiset|unordered_multimap|array)\\s*<', end: '>',
          keywords: CPP_KEYWORDS,
          contains: ['self', CPP_PRIMITIVE_TYPES]
        },
        {
          begin: hljs.IDENT_RE + '::',
          keywords: CPP_KEYWORDS
        },
        {
          className: 'class',
          beginKeywords: 'enum class struct union', end: /[{;:<>=]/,
          contains: [
            { beginKeywords: "final class struct" },
            hljs.TITLE_MODE
          ]
        }
      ]),
      exports: {
        preprocessor: PREPROCESSOR,
        strings: STRINGS,
        keywords: CPP_KEYWORDS
      }
    };
  }

  return cLike;

  return module.exports.definer || module.exports;

}());

hljs.registerLanguage('cpp', function () {
  'use strict';

  /*
  Language: C++
  Category: common, system
  Website: https://isocpp.org
  Requires: c-like.js
  */

  /** @type LanguageFn */
  function cpp(hljs) {
    var lang = hljs.requireLanguage('c-like').rawDefinition();
    // return auto-detection back on
    lang.disableAutodetect = false;
    lang.name = 'C++';
    lang.aliases = ['cc', 'c++', 'h++', 'hpp', 'hh', 'hxx', 'cxx'];
    return lang;
  }

  return cpp;

  return module.exports.definer || module.exports;

}());

hljs.registerLanguage('python', function () {
  'use strict';

  /*
  Language: Python
  Description: Python is an interpreted, object-oriented, high-level programming language with dynamic semantics.
  Website: https://www.python.org
  Category: common
  */

  function python(hljs) {
    const RESERVED_WORDS = [
      'and',
      'as',
      'assert',
      'async',
      'await',
      'break',
      'class',
      'continue',
      'def',
      'del',
      'elif',
      'else',
      'except',
      'finally',
      'for',
      '',
      'from',
      'global',
      'if',
      'import',
      'in',
      'is',
      'lambda',
      'nonlocal|10',
      'not',
      'or',
      'pass',
      'raise',
      'return',
      'try',
      'while',
      'with',
      'yield',
    ];

    const BUILT_INS = [
      '__import__',
      'abs',
      'all',
      'any',
      'ascii',
      'bin',
      'bool',
      'breakpoint',
      'bytearray',
      'bytes',
      'callable',
      'chr',
      'classmethod',
      'compile',
      'complex',
      'delattr',
      'dict',
      'dir',
      'divmod',
      'enumerate',
      'eval',
      'exec',
      'filter',
      'float',
      'format',
      'frozenset',
      'getattr',
      'globals',
      'hasattr',
      'hash',
      'help',
      'hex',
      'id',
      'input',
      'int',
      'isinstance',
      'issubclass',
      'iter',
      'len',
      'list',
      'locals',
      'map',
      'max',
      'memoryview',
      'min',
      'next',
      'object',
      'oct',
      'open',
      'ord',
      'pow',
      'print',
      'property',
      'range',
      'repr',
      'reversed',
      'round',
      'set',
      'setattr',
      'slice',
      'sorted',
      'staticmethod',
      'str',
      'sum',
      'super',
      'tuple',
      'type',
      'vars',
      'zip',
    ];

    const LITERALS = [
      '__debug__',
      'Ellipsis',
      'False',
      'None',
      'NotImplemented',
      'True',
    ];

    const KEYWORDS = {
      keyword: RESERVED_WORDS.join(' '),
      built_in: BUILT_INS.join(' '),
      literal: LITERALS.join(' ')
    };

    const PROMPT = {
      className: 'meta',  begin: /^(>>>|\.\.\.) /
    };

    const SUBST = {
      className: 'subst',
      begin: /\{/, end: /\}/,
      keywords: KEYWORDS,
      illegal: /#/
    };

    const LITERAL_BRACKET = {
      begin: /\{\{/,
      relevance: 0
    };

    const STRING = {
      className: 'string',
      contains: [hljs.BACKSLASH_ESCAPE],
      variants: [
        {
          begin: /([uU]|[bB]|[rR]|[bB][rR]|[rR][bB])?'''/, end: /'''/,
          contains: [hljs.BACKSLASH_ESCAPE, PROMPT],
          relevance: 10
        },
        {
          begin: /([uU]|[bB]|[rR]|[bB][rR]|[rR][bB])?"""/, end: /"""/,
          contains: [hljs.BACKSLASH_ESCAPE, PROMPT],
          relevance: 10
        },
        {
          begin: /([fF][rR]|[rR][fF]|[fF])'''/, end: /'''/,
          contains: [hljs.BACKSLASH_ESCAPE, PROMPT, LITERAL_BRACKET, SUBST]
        },
        {
          begin: /([fF][rR]|[rR][fF]|[fF])"""/, end: /"""/,
          contains: [hljs.BACKSLASH_ESCAPE, PROMPT, LITERAL_BRACKET, SUBST]
        },
        {
          begin: /([uU]|[rR])'/, end: /'/,
          relevance: 10
        },
        {
          begin: /([uU]|[rR])"/, end: /"/,
          relevance: 10
        },
        {
          begin: /([bB]|[bB][rR]|[rR][bB])'/, end: /'/
        },
        {
          begin: /([bB]|[bB][rR]|[rR][bB])"/, end: /"/
        },
        {
          begin: /([fF][rR]|[rR][fF]|[fF])'/, end: /'/,
          contains: [hljs.BACKSLASH_ESCAPE, LITERAL_BRACKET, SUBST]
        },
        {
          begin: /([fF][rR]|[rR][fF]|[fF])"/, end: /"/,
          contains: [hljs.BACKSLASH_ESCAPE, LITERAL_BRACKET, SUBST]
        },
        hljs.APOS_STRING_MODE,
        hljs.QUOTE_STRING_MODE
      ]
    };

    const NUMBER = {
      className: 'number', relevance: 0,
      variants: [
        {begin: hljs.BINARY_NUMBER_RE + '[lLjJ]?'},
        {begin: '\\b(0o[0-7]+)[lLjJ]?'},
        {begin: hljs.C_NUMBER_RE + '[lLjJ]?'}
      ]
    };

    const PARAMS = {
      className: 'params',
      variants: [
        // Exclude params at functions without params
        {begin: /\(\s*\)/, skip: true, className: null },
        {
          begin: /\(/, end: /\)/, excludeBegin: true, excludeEnd: true,
          keywords: KEYWORDS,
          contains: ['self', PROMPT, NUMBER, STRING, hljs.HASH_COMMENT_MODE],
        },
      ],
    };
    SUBST.contains = [STRING, NUMBER, PROMPT];

    return {
      name: 'Python',
      aliases: ['py', 'gyp', 'ipython'],
      keywords: KEYWORDS,
      illegal: /(<\/|->|\?)|=>/,
      contains: [
        PROMPT,
        NUMBER,
        // eat "if" prior to string so that it won't accidentally be
        // labeled as an f-string as in:
        { beginKeywords: "if", relevance: 0 },
        STRING,
        hljs.HASH_COMMENT_MODE,
        {
          variants: [
            {className: 'function', beginKeywords: 'def'},
            {className: 'class', beginKeywords: 'class'}
          ],
          end: /:/,
          illegal: /[${=;\n,]/,
          contains: [
            hljs.UNDERSCORE_TITLE_MODE,
            PARAMS,
            {
              begin: /->/, endsWithParent: true,
              keywords: 'None'
            }
          ]
        },
        {
          className: 'meta',
          begin: /^[\t ]*@/, end: /$/
        },
        {
          begin: /\b(print|exec)\(/ // don’t highlight keywords-turned-functions in Python 3
        }
      ]
    };
  }

  return python;

  return module.exports.definer || module.exports;

}());

hljs.registerLanguage('javascript', function () {
  'use strict';

  const IDENT_RE = '[A-Za-z$_][0-9A-Za-z$_]*';
  const KEYWORDS = [
    "as", // for exports
    "in",
    "of",
    "if",
    "for",
    "while",
    "finally",
    "var",
    "new",
    "function",
    "do",
    "return",
    "void",
    "else",
    "break",
    "catch",
    "instanceof",
    "with",
    "throw",
    "case",
    "default",
    "try",
    "switch",
    "continue",
    "typeof",
    "delete",
    "let",
    "yield",
    "const",
    "class",
    // JS handles these with a special rule
    // "get",
    // "set",
    "debugger",
    "async",
    "await",
    "static",
    "import",
    "from",
    "export",
    "extends"
  ];
  const LITERALS = [
    "true",
    "false",
    "null",
    "undefined",
    "NaN",
    "Infinity"
  ];

  const TYPES = [
    "Intl",
    "DataView",
    "Number",
    "Math",
    "Date",
    "String",
    "RegExp",
    "Object",
    "Function",
    "Boolean",
    "Error",
    "Symbol",
    "Set",
    "Map",
    "WeakSet",
    "WeakMap",
    "Proxy",
    "Reflect",
    "JSON",
    "Promise",
    "Float64Array",
    "Int16Array",
    "Int32Array",
    "Int8Array",
    "Uint16Array",
    "Uint32Array",
    "Float32Array",
    "Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "ArrayBuffer"
  ];

  const ERROR_TYPES = [
    "EvalError",
    "InternalError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "TypeError",
    "URIError"
  ];

  const BUILT_IN_GLOBALS = [
    "setInterval",
    "setTimeout",
    "clearInterval",
    "clearTimeout",

    "require",
    "exports",

    "eval",
    "isFinite",
    "isNaN",
    "parseFloat",
    "parseInt",
    "decodeURI",
    "decodeURIComponent",
    "encodeURI",
    "encodeURIComponent",
    "escape",
    "unescape"
  ];

  const BUILT_IN_VARIABLES = [
    "arguments",
    "this",
    "super",
    "console",
    "window",
    "document",
    "localStorage",
    "module",
    "global" // Node.js
  ];

  const BUILT_INS = [].concat(
    BUILT_IN_GLOBALS,
    BUILT_IN_VARIABLES,
    TYPES,
    ERROR_TYPES
  );

  /**
   * @param {string} value
   * @returns {RegExp}
   * */

  /**
   * @param {RegExp | string } re
   * @returns {string}
   */
  function source(re) {
    if (!re) return null;
    if (typeof re === "string") return re;

    return re.source;
  }

  /**
   * @param {RegExp | string } re
   * @returns {string}
   */
  function lookahead(re) {
    return concat('(?=', re, ')');
  }

  /**
   * @param {RegExp | string } re
   * @returns {string}
   */
  function optional(re) {
    return concat('(', re, ')?');
  }

  /**
   * @param {...(RegExp | string) } args
   * @returns {string}
   */
  function concat(...args) {
    const joined = args.map((x) => source(x)).join("");
    return joined;
  }

  /* eslint-disable no-unreachable */

  /** @type LanguageFn */
  function javascript(hljs) {
    /**
     * Takes a string like "<Booger" and checks to see
     * if we can find a matching "</Booger" later in the
     * content.
     * @param {RegExpMatchArray} match
     * @param {{after:number}} param1
     */
    const hasClosingTag = (match, { after }) => {
      const tag = match[0].replace("<", "</");
      const pos = match.input.indexOf(tag, after);
      return pos !== -1;
    };

    const IDENT_RE$1 = IDENT_RE;
    const FRAGMENT = {
      begin: '<>',
      end: '</>'
    };
    const XML_TAG = {
      begin: /<[A-Za-z0-9\\._:-]+/,
      end: /\/[A-Za-z0-9\\._:-]+>|\/>/,
      /**
       * @param {RegExpMatchArray} match
       * @param {CallbackResponse} response
       */
      isTrulyOpeningTag: (match, response) => {
        const afterMatchIndex = match[0].length + match.index;
        const nextChar = match.input[afterMatchIndex];
        // nested type?
        // HTML should not include another raw `<` inside a tag
        // But a type might: `<Array<Array<number>>`, etc.
        if (nextChar === "<") {
          response.ignoreMatch();
          return;
        }
        // <something>
        // This is now either a tag or a type.
        if (nextChar === ">") {
          // if we cannot find a matching closing tag, then we
          // will ignore it
          if (!hasClosingTag(match, { after: afterMatchIndex })) {
            response.ignoreMatch();
          }
        }
      }
    };
    const KEYWORDS$1 = {
      $pattern: IDENT_RE,
      keyword: KEYWORDS.join(" "),
      literal: LITERALS.join(" "),
      built_in: BUILT_INS.join(" ")
    };
    const nonDecimalLiterals = (prefixLetters, validChars) =>
      `\\b0[${prefixLetters}][${validChars}]([${validChars}_]*[${validChars}])?n?`;
    const noLeadingZeroDecimalDigits = /[1-9]([0-9_]*\d)?/;
    const decimalDigits = /\d([0-9_]*\d)?/;
    const exponentPart = concat(/[eE][+-]?/, decimalDigits);
    const NUMBER = {
      className: 'number',
      variants: [
        { begin: nonDecimalLiterals('bB', '01') }, // Binary literals
        { begin: nonDecimalLiterals('oO', '0-7') }, // Octal literals
        { begin: nonDecimalLiterals('xX', '0-9a-fA-F') }, // Hexadecimal literals
        { begin: concat(/\b/, noLeadingZeroDecimalDigits, 'n') }, // Non-zero BigInt literals
        { begin: concat(/(\b0)?\./, decimalDigits, optional(exponentPart)) }, // Decimal literals between 0 and 1
        { begin: concat(
          /\b/,
          noLeadingZeroDecimalDigits,
          optional(concat(/\./, optional(decimalDigits))), // fractional part
          optional(exponentPart)
          ) }, // Decimal literals >= 1
        { begin: /\b0[\.n]?/ }, // Zero literals (`0`, `0.`, `0n`)
      ],
      relevance: 0
    };
    const SUBST = {
      className: 'subst',
      begin: '\\$\\{',
      end: '\\}',
      keywords: KEYWORDS$1,
      contains: [] // defined later
    };
    const HTML_TEMPLATE = {
      begin: 'html`',
      end: '',
      starts: {
        end: '`',
        returnEnd: false,
        contains: [
          hljs.BACKSLASH_ESCAPE,
          SUBST
        ],
        subLanguage: 'xml'
      }
    };
    const CSS_TEMPLATE = {
      begin: 'css`',
      end: '',
      starts: {
        end: '`',
        returnEnd: false,
        contains: [
          hljs.BACKSLASH_ESCAPE,
          SUBST
        ],
        subLanguage: 'css'
      }
    };
    const TEMPLATE_STRING = {
      className: 'string',
      begin: '`',
      end: '`',
      contains: [
        hljs.BACKSLASH_ESCAPE,
        SUBST
      ]
    };
    const JSDOC_COMMENT = hljs.COMMENT(
      '/\\*\\*',
      '\\*/',
      {
        relevance: 0,
        contains: [
          {
            className: 'doctag',
            begin: '@[A-Za-z]+',
            contains: [
              {
                className: 'type',
                begin: '\\{',
                end: '\\}',
                relevance: 0
              },
              {
                className: 'variable',
                begin: IDENT_RE$1 + '(?=\\s*(-)|$)',
                endsParent: true,
                relevance: 0
              },
              // eat spaces (not newlines) so we can find
              // types or variables
              {
                begin: /(?=[^\n])\s/,
                relevance: 0
              }
            ]
          }
        ]
      }
    );
    const COMMENT = {
      className: "comment",
      variants: [
        JSDOC_COMMENT,
        hljs.C_BLOCK_COMMENT_MODE,
        hljs.C_LINE_COMMENT_MODE
      ]
    };
    const SUBST_INTERNALS = [
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE,
      HTML_TEMPLATE,
      CSS_TEMPLATE,
      TEMPLATE_STRING,
      NUMBER,
      hljs.REGEXP_MODE
    ];
    SUBST.contains = SUBST_INTERNALS
      .concat({
        // we need to pair up {} inside our subst to prevent
        // it from ending too early by matching another }
        begin: /{/,
        end: /}/,
        keywords: KEYWORDS$1,
        contains: [
          "self"
        ].concat(SUBST_INTERNALS)
      });
    const SUBST_AND_COMMENTS = [].concat(COMMENT, SUBST.contains);
    const PARAMS_CONTAINS = SUBST_AND_COMMENTS.concat([
      // eat recursive parens in sub expressions
      {
        begin: /\(/,
        end: /\)/,
        keywords: KEYWORDS$1,
        contains: ["self"].concat(SUBST_AND_COMMENTS)
      }
    ]);
    const PARAMS = {
      className: 'params',
      begin: /\(/,
      end: /\)/,
      excludeBegin: true,
      excludeEnd: true,
      keywords: KEYWORDS$1,
      contains: PARAMS_CONTAINS
    };

    return {
      name: 'Javascript',
      aliases: ['js', 'jsx', 'mjs', 'cjs'],
      keywords: KEYWORDS$1,
      // this will be extended by TypeScript
      exports: { PARAMS_CONTAINS },
      illegal: /#(?![$_A-z])/,
      contains: [
        hljs.SHEBANG({
          label: "shebang",
          binary: "node",
          relevance: 5
        }),
        {
          label: "use_strict",
          className: 'meta',
          relevance: 10,
          begin: /^\s*['"]use (strict|asm)['"]/
        },
        hljs.APOS_STRING_MODE,
        hljs.QUOTE_STRING_MODE,
        HTML_TEMPLATE,
        CSS_TEMPLATE,
        TEMPLATE_STRING,
        COMMENT,
        NUMBER,
        { // object attr container
          begin: concat(/[{,\n]\s*/,
            // we need to look ahead to make sure that we actually have an
            // attribute coming up so we don't steal a comma from a potential
            // "value" container
            //
            // NOTE: this might not work how you think.  We don't actually always
            // enter this mode and stay.  Instead it might merely match `,
            // <comments up next>` and then immediately end after the , because it
            // fails to find any actual attrs. But this still does the job because
            // it prevents the value contain rule from grabbing this instead and
            // prevening this rule from firing when we actually DO have keys.
            lookahead(concat(
              // we also need to allow for multiple possible comments inbetween
              // the first key:value pairing
              /(\/\/.*$)*/,
              /(\/\*(.|\n)*\*\/)*/,
              /\s*/,
              IDENT_RE$1 + '\\s*:'))),
          relevance: 0,
          contains: [
            {
              className: 'attr',
              begin: IDENT_RE$1 + lookahead('\\s*:'),
              relevance: 0
            }
          ]
        },
        { // "value" container
          begin: '(' + hljs.RE_STARTERS_RE + '|\\b(case|return|throw)\\b)\\s*',
          keywords: 'return throw case',
          contains: [
            COMMENT,
            hljs.REGEXP_MODE,
            {
              className: 'function',
              // we have to count the parens to make sure we actually have the
              // correct bounding ( ) before the =>.  There could be any number of
              // sub-expressions inside also surrounded by parens.
              begin: '(\\(' +
              '[^()]*(\\(' +
              '[^()]*(\\(' +
              '[^()]*' +
              '\\))*[^()]*' +
              '\\))*[^()]*' +
              '\\)|' + hljs.UNDERSCORE_IDENT_RE + ')\\s*=>',
              returnBegin: true,
              end: '\\s*=>',
              contains: [
                {
                  className: 'params',
                  variants: [
                    {
                      begin: hljs.UNDERSCORE_IDENT_RE
                    },
                    {
                      className: null,
                      begin: /\(\s*\)/,
                      skip: true
                    },
                    {
                      begin: /\(/,
                      end: /\)/,
                      excludeBegin: true,
                      excludeEnd: true,
                      keywords: KEYWORDS$1,
                      contains: PARAMS_CONTAINS
                    }
                  ]
                }
              ]
            },
            { // could be a comma delimited list of params to a function call
              begin: /,/, relevance: 0
            },
            {
              className: '',
              begin: /\s/,
              end: /\s*/,
              skip: true
            },
            { // JSX
              variants: [
                { begin: FRAGMENT.begin, end: FRAGMENT.end },
                {
                  begin: XML_TAG.begin,
                  // we carefully check the opening tag to see if it truly
                  // is a tag and not a false positive
                  'on:begin': XML_TAG.isTrulyOpeningTag,
                  end: XML_TAG.end
                }
              ],
              subLanguage: 'xml',
              contains: [
                {
                  begin: XML_TAG.begin,
                  end: XML_TAG.end,
                  skip: true,
                  contains: ['self']
                }
              ]
            }
          ],
          relevance: 0
        },
        {
          className: 'function',
          beginKeywords: 'function',
          end: /[{;]/,
          excludeEnd: true,
          keywords: KEYWORDS$1,
          contains: [
            'self',
            hljs.inherit(hljs.TITLE_MODE, { begin: IDENT_RE$1 }),
            PARAMS
          ],
          illegal: /%/
        },
        {
          className: 'function',
          // we have to count the parens to make sure we actually have the correct
          // bounding ( ).  There could be any number of sub-expressions inside
          // also surrounded by parens.
          begin: hljs.UNDERSCORE_IDENT_RE +
            '\\(' + // first parens
            '[^()]*(\\(' +
              '[^()]*(\\(' +
                '[^()]*' +
              '\\))*[^()]*' +
            '\\))*[^()]*' +
            '\\)\\s*{', // end parens
          returnBegin:true,
          contains: [
            PARAMS,
            hljs.inherit(hljs.TITLE_MODE, { begin: IDENT_RE$1 }),
          ]
        },
        // hack: prevents detection of keywords in some circumstances
        // .keyword()
        // $keyword = x
        {
          variants: [
            { begin: '\\.' + IDENT_RE$1 },
            { begin: '\\$' + IDENT_RE$1 }
          ],
          relevance: 0
        },
        { // ES6 class
          className: 'class',
          beginKeywords: 'class',
          end: /[{;=]/,
          excludeEnd: true,
          illegal: /[:"\[\]]/,
          contains: [
            { beginKeywords: 'extends' },
            hljs.UNDERSCORE_TITLE_MODE
          ]
        },
        {
          begin: /\b(?=constructor)/,
          end: /[\{;]/,
          excludeEnd: true,
          contains: [
            hljs.inherit(hljs.TITLE_MODE, { begin: IDENT_RE$1 }),
            'self',
            PARAMS
          ]
        },
        {
          begin: '(get|set)\\s+(?=' + IDENT_RE$1 + '\\()',
          end: /{/,
          keywords: "get set",
          contains: [
            hljs.inherit(hljs.TITLE_MODE, { begin: IDENT_RE$1 }),
            { begin: /\(\)/ }, // eat to avoid empty params
            PARAMS
          ]
        },
        {
          begin: /\$[(.]/ // relevance booster for a pattern common to JS libs: `$(something)` and `$.something`
        }
      ]
    };
  }

  return javascript;

  return module.exports.definer || module.exports;

}());

hljs.registerLanguage('bash', function () {
  'use strict';

  /*
  Language: Bash
  Author: vah <vahtenberg@gmail.com>
  Contributrors: Benjamin Pannell <contact@sierrasoftworks.com>
  Website: https://www.gnu.org/software/bash/
  Category: common
  */

  /** @type LanguageFn */
  function bash(hljs) {
    const VAR = {};
    const BRACED_VAR = {
      begin: /\$\{/,
      end:/\}/,
      contains: [
        "self",
        {
          begin: /:-/,
          contains: [ VAR ]
        } // default values
      ]
    };
    Object.assign(VAR,{
      className: 'variable',
      variants: [
        {begin: /\$[\w\d#@][\w\d_]*/},
        BRACED_VAR
      ]
    });

    const SUBST = {
      className: 'subst',
      begin: /\$\(/, end: /\)/,
      contains: [hljs.BACKSLASH_ESCAPE]
    };
    const HERE_DOC = {
      begin: /<<-?\s*(?=\w+)/,
      starts: {
        contains: [
          hljs.END_SAME_AS_BEGIN({
            begin: /(\w+)/,
            end: /(\w+)/,
            className: 'string'
          })
        ]
      }
    };
    const QUOTE_STRING = {
      className: 'string',
      begin: /"/, end: /"/,
      contains: [
        hljs.BACKSLASH_ESCAPE,
        VAR,
        SUBST
      ]
    };
    SUBST.contains.push(QUOTE_STRING);
    const ESCAPED_QUOTE = {
      className: '',
      begin: /\\"/

    };
    const APOS_STRING = {
      className: 'string',
      begin: /'/, end: /'/
    };
    const ARITHMETIC = {
      begin: /\$\(\(/,
      end: /\)\)/,
      contains: [
        { begin: /\d+#[0-9a-f]+/, className: "number" },
        hljs.NUMBER_MODE,
        VAR
      ]
    };
    const SH_LIKE_SHELLS = [
      "fish",
      "bash",
      "zsh",
      "sh",
      "csh",
      "ksh",
      "tcsh",
      "dash",
      "scsh",
    ];
    const KNOWN_SHEBANG = hljs.SHEBANG({
      binary: `(${SH_LIKE_SHELLS.join("|")})`,
      relevance: 10
    });
    const FUNCTION = {
      className: 'function',
      begin: /\w[\w\d_]*\s*\(\s*\)\s*\{/,
      returnBegin: true,
      contains: [hljs.inherit(hljs.TITLE_MODE, {begin: /\w[\w\d_]*/})],
      relevance: 0
    };

    return {
      name: 'Bash',
      aliases: ['sh', 'zsh'],
      keywords: {
        $pattern: /\b[a-z._-]+\b/,
        keyword:
          'if then else elif fi for while in do done case esac function',
        literal:
          'true false',
        built_in:
          // Shell built-ins
          // http://www.gnu.org/software/bash/manual/html_node/Shell-Builtin-Commands.html
          'break cd continue eval exec exit export getopts hash pwd readonly return shift test times ' +
          'trap umask unset ' +
          // Bash built-ins
          'alias bind builtin caller command declare echo enable help let local logout mapfile printf ' +
          'read readarray source type typeset ulimit unalias ' +
          // Shell modifiers
          'set shopt ' +
          // Zsh built-ins
          'autoload bg bindkey bye cap chdir clone comparguments compcall compctl compdescribe compfiles ' +
          'compgroups compquote comptags comptry compvalues dirs disable disown echotc echoti emulate ' +
          'fc fg float functions getcap getln history integer jobs kill limit log noglob popd print ' +
          'pushd pushln rehash sched setcap setopt stat suspend ttyctl unfunction unhash unlimit ' +
          'unsetopt vared wait whence where which zcompile zformat zftp zle zmodload zparseopts zprof ' +
          'zpty zregexparse zsocket zstyle ztcp'
      },
      contains: [
        KNOWN_SHEBANG, // to catch known shells and boost relevancy
        hljs.SHEBANG(), // to catch unknown shells but still highlight the shebang
        FUNCTION,
        ARITHMETIC,
        hljs.HASH_COMMENT_MODE,
        HERE_DOC,
        QUOTE_STRING,
        ESCAPED_QUOTE,
        APOS_STRING,
        VAR
      ]
    };
  }

  return bash;

  return module.exports.definer || module.exports;

}());

hljs.registerLanguage('diff', function () {
  'use strict';

  /*
  Language: Diff
  Description: Unified and context diff
  Author: Vasily Polovnyov <vast@whiteants.net>
  Website: https://www.gnu.org/software/diffutils/
  Category: common
  */

  /** @type LanguageFn */
  function diff(hljs) {
    return {
      name: 'Diff',
      aliases: ['patch'],
      contains: [
        {
          className: 'meta',
          relevance: 10,
          variants: [
            {begin: /^@@ +\-\d+,\d+ +\+\d+,\d+ +@@$/},
            {begin: /^\*\*\* +\d+,\d+ +\*\*\*\*$/},
            {begin: /^\-\-\- +\d+,\d+ +\-\-\-\-$/}
          ]
        },
        {
          className: 'comment',
          variants: [
            {begin: /Index: /, end: /$/},
            {begin: /={3,}/, end: /$/},
            {begin: /^\-{3}/, end: /$/},
            {begin: /^\*{3} /, end: /$/},
            {begin: /^\+{3}/, end: /$/},
            {begin: /^\*{15}$/ }
          ]
        },
        {
          className: 'addition',
          begin: '^\\+', end: '$'
        },
        {
          className: 'deletion',
          begin: '^\\-', end: '$'
        },
        {
          className: 'addition',
          begin: '^\\!', end: '$'
        }
      ]
    };
  }

  return diff;

  return module.exports.definer || module.exports;

}());

hljs.registerLanguage('xml', function () {
  'use strict';

  /*
  Language: HTML, XML
  Website: https://www.w3.org/XML/
  Category: common
  */

  function xml(hljs) {
    var XML_IDENT_RE = '[A-Za-z0-9\\._:-]+';
    var XML_ENTITIES = {
      className: 'symbol',
      begin: '&[a-z]+;|&#[0-9]+;|&#x[a-f0-9]+;'
    };
    var XML_META_KEYWORDS = {
  	  begin: '\\s',
  	  contains:[
  	    {
  	      className: 'meta-keyword',
  	      begin: '#?[a-z_][a-z1-9_-]+',
  	      illegal: '\\n',
        }
  	  ]
    };
    var XML_META_PAR_KEYWORDS = hljs.inherit(XML_META_KEYWORDS, {begin: '\\(', end: '\\)'});
    var APOS_META_STRING_MODE = hljs.inherit(hljs.APOS_STRING_MODE, {className: 'meta-string'});
    var QUOTE_META_STRING_MODE = hljs.inherit(hljs.QUOTE_STRING_MODE, {className: 'meta-string'});
    var TAG_INTERNALS = {
      endsWithParent: true,
      illegal: /</,
      relevance: 0,
      contains: [
        {
          className: 'attr',
          begin: XML_IDENT_RE,
          relevance: 0
        },
        {
          begin: /=\s*/,
          relevance: 0,
          contains: [
            {
              className: 'string',
              endsParent: true,
              variants: [
                {begin: /"/, end: /"/, contains: [XML_ENTITIES]},
                {begin: /'/, end: /'/, contains: [XML_ENTITIES]},
                {begin: /[^\s"'=<>`]+/}
              ]
            }
          ]
        }
      ]
    };
    return {
      name: 'HTML, XML',
      aliases: ['html', 'xhtml', 'rss', 'atom', 'xjb', 'xsd', 'xsl', 'plist', 'wsf', 'svg'],
      case_insensitive: true,
      contains: [
        {
          className: 'meta',
          begin: '<![a-z]', end: '>',
          relevance: 10,
          contains: [
  				  XML_META_KEYWORDS,
  				  QUOTE_META_STRING_MODE,
  				  APOS_META_STRING_MODE,
  					XML_META_PAR_KEYWORDS,
  					{
  					  begin: '\\[', end: '\\]',
  					  contains:[
  						  {
  					      className: 'meta',
  					      begin: '<![a-z]', end: '>',
  					      contains: [
  					        XML_META_KEYWORDS,
  					        XML_META_PAR_KEYWORDS,
  					        QUOTE_META_STRING_MODE,
  					        APOS_META_STRING_MODE
  						    ]
  			        }
  					  ]
  				  }
  				]
        },
        hljs.COMMENT(
          '<!--',
          '-->',
          {
            relevance: 10
          }
        ),
        {
          begin: '<\\!\\[CDATA\\[', end: '\\]\\]>',
          relevance: 10
        },
        XML_ENTITIES,
        {
          className: 'meta',
          begin: /<\?xml/, end: /\?>/, relevance: 10
        },
        {
          className: 'tag',
          /*
          The lookahead pattern (?=...) ensures that 'begin' only matches
          '<style' as a single word, followed by a whitespace or an
          ending braket. The '$' is needed for the lexeme to be recognized
          by hljs.subMode() that tests lexemes outside the stream.
          */
          begin: '<style(?=\\s|>)', end: '>',
          keywords: {name: 'style'},
          contains: [TAG_INTERNALS],
          starts: {
            end: '</style>', returnEnd: true,
            subLanguage: ['css', 'xml']
          }
        },
        {
          className: 'tag',
          // See the comment in the <style tag about the lookahead pattern
          begin: '<script(?=\\s|>)', end: '>',
          keywords: {name: 'script'},
          contains: [TAG_INTERNALS],
          starts: {
            end: '\<\/script\>', returnEnd: true,
            subLanguage: ['javascript', 'handlebars', 'xml']
          }
        },
        {
          className: 'tag',
          begin: '</?', end: '/?>',
          contains: [
            {
              className: 'name', begin: /[^\/><\s]+/, relevance: 0
            },
            TAG_INTERNALS
          ]
        }
      ]
    };
  }

  return xml;

  return module.exports.definer || module.exports;

}());

hljs.registerLanguage('markdown', function () {
  'use strict';

  /*
  Language: Markdown
  Requires: xml.js
  Author: John Crepezzi <john.crepezzi@gmail.com>
  Website: https://daringfireball.net/projects/markdown/
  Category: common, markup
  */

  function markdown(hljs) {
    const INLINE_HTML = {
      begin: '<', end: '>',
      subLanguage: 'xml',
      relevance: 0
    };
    const HORIZONTAL_RULE = {
      begin: '^[-\\*]{3,}', end: '$'
    };
    const CODE = {
      className: 'code',
      variants: [
        // TODO: fix to allow these to work with sublanguage also
        { begin: '(`{3,})(.|\\n)*?\\1`*[ ]*', },
        { begin: '(~{3,})(.|\\n)*?\\1~*[ ]*', },
        // needed to allow markdown as a sublanguage to work
        { begin: '```', end: '```+[ ]*$' },
        { begin: '~~~', end: '~~~+[ ]*$' },
        { begin: '`.+?`' },
        {
          begin: '(?=^( {4}|\\t))',
          // use contains to gobble up multiple lines to allow the block to be whatever size
          // but only have a single open/close tag vs one per line
          contains: [
            { begin: '^( {4}|\\t)', end: '(\\n)$' }
          ],
          relevance: 0
        }
      ]
    };
    const LIST = {
      className: 'bullet',
      begin: '^[ \t]*([*+-]|(\\d+\\.))(?=\\s+)',
      end: '\\s+',
      excludeEnd: true
    };
    const LINK_REFERENCE = {
      begin: /^\[[^\n]+\]:/,
      returnBegin: true,
      contains: [
        {
          className: 'symbol',
          begin: /\[/, end: /\]/,
          excludeBegin: true, excludeEnd: true
        },
        {
          className: 'link',
          begin: /:\s*/, end: /$/,
          excludeBegin: true
        }
      ]
    };
    const LINK = {
      begin: '\\[.+?\\][\\(\\[].*?[\\)\\]]',
      returnBegin: true,
      contains: [
        {
          className: 'string',
          begin: '\\[', end: '\\]',
          excludeBegin: true,
          returnEnd: true,
          relevance: 0
        },
        {
          className: 'link',
          begin: '\\]\\(', end: '\\)',
          excludeBegin: true, excludeEnd: true
        },
        {
          className: 'symbol',
          begin: '\\]\\[', end: '\\]',
          excludeBegin: true, excludeEnd: true
        }
      ],
      relevance: 10
    };
    const BOLD = {
      className: 'strong',
      contains: [],
      variants: [
        {begin: /_{2}/, end: /_{2}/ },
        {begin: /\*{2}/, end: /\*{2}/ }
      ]
    };
    const ITALIC = {
      className: 'emphasis',
      contains: [],
      variants: [
        { begin: /\*(?!\*)/, end: /\*/ },
        { begin: /_(?!_)/, end: /_/, relevance: 0},
      ]
    };
    BOLD.contains.push(ITALIC);
    ITALIC.contains.push(BOLD);

    var CONTAINABLE = [
      INLINE_HTML,
      LINK
    ];

    BOLD.contains = BOLD.contains.concat(CONTAINABLE);
    ITALIC.contains = ITALIC.contains.concat(CONTAINABLE);

    CONTAINABLE = CONTAINABLE.concat(BOLD,ITALIC);

    const HEADER = {
      className: 'section',
      variants: [
        {
          begin: '^#{1,6}',
          end: '$',
          contains: CONTAINABLE
         },
        {
          begin: '(?=^.+?\\n[=-]{2,}$)',
          contains: [
            { begin: '^[=-]*$' },
            { begin: '^', end: "\\n", contains: CONTAINABLE },
          ]
         }
      ]
    };

    const BLOCKQUOTE = {
      className: 'quote',
      begin: '^>\\s+',
      contains: CONTAINABLE,
      end: '$',
    };

    return {
      name: 'Markdown',
      aliases: ['md', 'mkdown', 'mkd'],
      contains: [
        HEADER,
        INLINE_HTML,
        LIST,
        BOLD,
        ITALIC,
        BLOCKQUOTE,
        CODE,
        HORIZONTAL_RULE,
        LINK,
        LINK_REFERENCE
      ]
    };
  }

  return markdown;

  return module.exports.definer || module.exports;

}());
