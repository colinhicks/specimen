var dist = (function (exports) {
  'use strict';

  // https://github.com/substack/deep-freeze/blob/master/index.js
  /** @param {any} obj */
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
      function attr_str(attr) {
        return ' ' + attr.nodeName + '="' + escapeHTML(attr.value) + '"';
      }
      // @ts-ignore
      result += '<' + tag(node) + [].map.call(node.attributes, attr_str).join('') + '>';
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
        const result = m.exec(s);
        if (result) {
          this.regexIndex += result.position + 1;
          if (this.regexIndex === this.count) { // wrap-around
            this.regexIndex = 0;
          }
        }

        // this.regexIndex = 0;
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

      let kw_pattern = null;
      if (typeof mode.keywords === "object") {
        kw_pattern = mode.keywords.$pattern;
        delete mode.keywords.$pattern;
      }

      if (mode.keywords) {
        mode.keywords = compileKeywords(mode.keywords, language.case_insensitive);
      }

      // both are not allowed
      if (mode.lexemes && kw_pattern) {
        throw new Error("ERR: Prefer `keywords.$pattern` to `mode.lexemes`, BOTH are not allowed. (see mode reference) ");
      }

      // `mode.lexemes` was the old standard before we added and now recommend
      // using `keywords.$pattern` to pass the keyword pattern
      cmode.keywordPatternRe = langRe(mode.lexemes || kw_pattern || /\w+/, true);

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
        return expand_or_clone_mode(c === 'self' ? mode : c);
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
  function expand_or_clone_mode(mode) {
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
   * @param {boolean} case_insensitive
   */
  function compileKeywords(rawKeywords, case_insensitive) {
    /** @type KeywordDict */
    var compiled_keywords = {};

    if (typeof rawKeywords === 'string') { // string
      splitAndCompile('keyword', rawKeywords);
    } else {
      Object.keys(rawKeywords).forEach(function(className) {
        splitAndCompile(className, rawKeywords[className]);
      });
    }
    return compiled_keywords;

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
      if (case_insensitive) {
        keywordList = keywordList.toLowerCase();
      }
      keywordList.split(' ').forEach(function(keyword) {
        var pair = keyword.split('|');
        compiled_keywords[pair[0]] = [className, scoreForKeyword(pair[0], pair[1])];
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

  var version = "10.1.2";

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
          emitter.addText(mode_buffer);
          return;
        }

        let last_index = 0;
        top.keywordPatternRe.lastIndex = 0;
        let match = top.keywordPatternRe.exec(mode_buffer);
        let buf = "";

        while (match) {
          buf += mode_buffer.substring(last_index, match.index);
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
          last_index = top.keywordPatternRe.lastIndex;
          match = top.keywordPatternRe.exec(mode_buffer);
        }
        buf += mode_buffer.substr(last_index);
        emitter.addText(buf);
      }

      function processSubLanguage() {
        if (mode_buffer === "") return;
        /** @type HighlightResult */
        var result = null;

        if (typeof top.subLanguage === 'string') {
          if (!languages[top.subLanguage]) {
            emitter.addText(mode_buffer);
            return;
          }
          result = _highlight(top.subLanguage, mode_buffer, true, continuations[top.subLanguage]);
          continuations[top.subLanguage] = result.top;
        } else {
          result = highlightAuto(mode_buffer, top.subLanguage.length ? top.subLanguage : null);
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
        mode_buffer = '';
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
          mode_buffer += lexeme[0];
          return 1;
        } else {
          // no need to move the cursor, we still have additional regexes to try and
          // match at this very spot
          continueScanAtSamePosition = true;
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
        var new_mode = match.rule;

        const resp = new Response(new_mode);
        // first internal before callbacks, then the public ones
        const beforeCallbacks = [new_mode.__beforeBegin, new_mode["on:begin"]];
        for (const cb of beforeCallbacks) {
          if (!cb) continue;
          cb(match, resp);
          if (resp.ignore) return doIgnore(lexeme);
        }

        if (new_mode && new_mode.endSameAsBegin) {
          new_mode.endRe = escape(lexeme);
        }

        if (new_mode.skip) {
          mode_buffer += lexeme;
        } else {
          if (new_mode.excludeBegin) {
            mode_buffer += lexeme;
          }
          processBuffer();
          if (!new_mode.returnBegin && !new_mode.excludeBegin) {
            mode_buffer = lexeme;
          }
        }
        startNewMode(new_mode);
        // if (mode["after:begin"]) {
        //   let resp = new Response(mode);
        //   mode["after:begin"](match, resp);
        // }
        return new_mode.returnBegin ? 0 : lexeme.length;
      }

      /**
       * Handle the potential end of mode
       *
       * @param {RegExpMatchArray} match - the current match
       */
      function doEndMatch(match) {
        var lexeme = match[0];
        var matchPlusRemainder = codeToHighlight.substr(match.index);

        var end_mode = endOfMode(top, match, matchPlusRemainder);
        if (!end_mode) { return NO_MATCH; }

        var origin = top;
        if (origin.skip) {
          mode_buffer += lexeme;
        } else {
          if (!(origin.returnEnd || origin.excludeEnd)) {
            mode_buffer += lexeme;
          }
          processBuffer();
          if (origin.excludeEnd) {
            mode_buffer = lexeme;
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
        } while (top !== end_mode.parent);
        if (end_mode.starts) {
          if (end_mode.endSameAsBegin) {
            end_mode.starts.endRe = end_mode.endRe;
          }
          startNewMode(end_mode.starts);
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
        mode_buffer += textBeforeMatch;

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
          mode_buffer += codeToHighlight.slice(match.index, match.index + 1);
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

        mode_buffer += lexeme;
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
      var mode_buffer = '';
      var relevance = 0;
      var index = 0;
      var iterations = 0;
      var continueScanAtSamePosition = false;

      try {
        top.matcher.considerAll();

        for (;;) {
          iterations++;
          if (continueScanAtSamePosition) {
            // only regexes not matched previously will now be
            // considered for a potential match
            continueScanAtSamePosition = false;
          } else {
            top.matcher.lastIndex = index;
            top.matcher.considerAll();
          }
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

    /* Interface definition */

    Object.assign(hljs, {
      highlight,
      highlightAuto,
      fixMarkup,
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
      addPlugin
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

  var core = highlight;

  function ksql(hljs) {
      const COMMENT_MODE = hljs.COMMENT('--', '$');

      const beginKeywords = 'list show describe print terminate set unset create insert delete drop explain run select';

      return {
          case_insensitive: true,
          illegal: /[<>{}*]/,
          contains: [
              {
                  beginKeywords,
                  end: /;/, endsWithParent: true,
                  lexemes: /[\w\.]+/,
                  keywords: {
                      keyword: `${beginKeywords} properties topic topics stream streams table tables function functions source sources sink sinks connector connectors extended query queries if not and or exists with into on from by as is at partition partitions values script type types window where group having emit changes beginning between like limit size tumbling hopping advance session year month day hour minute second millisecond years months days hours minutes seconds milliseconds inner full outer left right join within distinct key load rename properties namespace primary materialized view delimited kafka_topic value_format`,
                      literal:
                          'true false null',
                      built_in:
                          'array map struct decimal varchar string boolean integer int bigint double'
                  },
                  contains: [
                      {
                          className: 'string',
                          begin: '\'', end: '\'',
                          contains: [hljs.BACKSLASH_ESCAPE, { begin: '\'\'' }]
                      },
                      {
                          className: 'string',
                          begin: '"', end: '"',
                          contains: [hljs.BACKSLASH_ESCAPE, { begin: '""' }]
                      },
                      {
                          className: 'string',
                          begin: '`', end: '`',
                          contains: [hljs.BACKSLASH_ESCAPE]
                      },
                      hljs.C_NUMBER_MODE,
                      hljs.C_BLOCK_COMMENT_MODE,
                      COMMENT_MODE,
                      hljs.HASH_COMMENT_MODE
                  ]
              },
              hljs.C_BLOCK_COMMENT_MODE,
              COMMENT_MODE,
              hljs.HASH_COMMENT_MODE
          ]
      };
  }

  function uuidv4() {
    return 'id-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function inverse_map(m) {
    return Object.entries(m).reduce((all, [k, v]) => {
      let new_v = all[v] || [];
      new_v.push(k);
      all[v] = new_v;

      return all;
    }, {})
  }
  function cycle_array(arr) {
    arr.push(arr.shift());
    return arr;
  }

  function select_keys(m, keys) {
    return keys.reduce((all, key) => {
      all[key] = m[key];
      return all;
    }, {});
  }

  function relative_add(x) {
    return "+=" + x;
  }

  function relative_sub(x) {
    return "-=" + x;
  }

  function ms_for_translate(m, ms) {
    return (Math.abs(m.translateX || 0) + Math.abs(m.translateY || 0)) * ms;
  }

  function create_svg_el(tag) {
    return document.createElementNS("http://www.w3.org/2000/svg", tag);
  }

  function build_data(config, styles, computed) {
    const { row_id, record, viewable } = config;

    return {
      kind: "row_card",
      id: uuidv4(),
      vars: {
        row_id,
        record,
        viewable
      }
    };
  }

  function show_record_contents(card_id) {
    return function(event) {
      const card = document.getElementById(card_id);

      card.style.display = "block";
      card.style.left = event.pageX + 10 + "px";
      card.style.top = event.pageY + 10 + "px";
    };
  }

  function hide_record_contents(card_id) {
    return function(event) {
      const card = document.getElementById(card_id);
      card.style.display = "none";
    }
  }

  function card_text(record ) {
    const record_ks = ["stream", "partition", "offset", "t", "key", "value"];
    const row_data = select_keys(record, record_ks);
    return JSON.stringify(row_data, null, 4);
  }

  function render(data) {
    const { id, vars, rendering } = data;
    const { viewable } = vars;

    const card = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    card.id = id;
    card.style.background = "#f2f2f2";
    card.style.border = "1px solid black";
    card.style.borderRadius = "5px";
    card.style.padding = "5px";
    card.style.position = "absolute";
    card.style.display = "none";
    card.style.whiteSpace = "pre";
    card.classList.add("code");
    card.textContent = card_text(vars.record);

    const row = document.getElementById(vars.row_id);

    if (viewable) {
      row.onmousemove = show_record_contents(id);
      row.onmouseout = hide_record_contents(id);
    }

    return card;
  }

  function update_card_text(row_card, record) {
    const { id } = row_card;
    const el = document.getElementById(id);

    el.textContent = card_text(record);
  }

  function toggle_visibility(row_card) {
    const { id, vars } = row_card;
    const { row_id, viewable } = vars;

    const row = document.getElementById(vars.row_id);

    if (viewable) {
      row.onmousemove = show_record_contents(id);
      row.onmouseout = hide_record_contents(id);
    } else {
      row.onmousemove = () => {};
      row.onmouseout = () => {};
    }
  }

  function build_data$1(config, styles, computed) {
    const { record, source_id, card_viewable, style: row_style } = config;

    const { row_width, row_height } = styles;
    const { part_height } = styles;
    const { top_y, left_x } = computed;

    const id = uuidv4();
    const this_top_y = top_y + (part_height / 2) - (row_height / 2);

    const card_config = {
      row_id: id,
      record: record,
      viewable: card_viewable
    };
    const row_card_data = build_data(card_config);

    return {
      kind: "row",
      id: id,
      rendering: {
        width: row_width,
        height: row_height,
        x: left_x,
        y: this_top_y,
        fill: row_style.fill
      },
      vars: {
        record: {
          stream: record.stream,
          partition: record.partition,
          offset: record.offset,
          t: record.t,
          key: record.key,
          value: record.value
        },
        source_id: source_id
      },
      children: {
        row_card: row_card_data
      }
    };
  }


  function render$1(data) {
    // Intentionally skip rendering of the row card.
    // That has to happen last to correct for its z-index.
    const { id, vars, rendering } = data;

    const circle = create_svg_el("circle");
    circle.id = id;
    circle.setAttributeNS(null, "cx", (rendering.x + (rendering.width / 2)));
    circle.setAttributeNS(null, "cy", (rendering.y + (rendering.height / 2)));
    circle.setAttributeNS(null, "r", (rendering.width / 2));
    circle.setAttributeNS(null, "fill", rendering.fill);
    circle.setAttributeNS(null, "data-stream", vars.record.stream);
    circle.setAttributeNS(null, "data-partition", vars.record.partition);
    circle.setAttributeNS(null, "data-offset", vars.record.offset);

    return circle;
  }

  function build_data$2(config, styles, computed) {
    const { partition, pq_name } = config;
    const { consumer_m_text_margin_bottom, font_size } = styles;
    const { left_x, bottom_y } = computed;

    const x = left_x;
    const arrow_y = bottom_y;
    const text_y = (arrow_y - consumer_m_text_margin_bottom);

    return {
      kind: "consumer_marker",
      id: uuidv4(),
      rendering: {
        left_x: x,
        arrow_y: arrow_y,
        text_y: text_y,
        font_size
      },
      vars: {
        partition: partition,
        pq_name: pq_name,
        arrow: "↓"
      },
      refs: {
        top_y: text_y
      }
    };
  }

  function render$2(data) {
    const { id, vars, rendering } = data;

    const g = create_svg_el("g");
    g.id = id;
    g.setAttributeNS(null, "data-partition", vars.partition);

    const arrow_text = create_svg_el("text");
    arrow_text.setAttributeNS(null, "x", rendering.left_x);
    arrow_text.setAttributeNS(null, "y", rendering.arrow_y);
    arrow_text.setAttributeNS(null, "font-size", rendering.font_size);
    arrow_text.classList.add("code");
    arrow_text.textContent = vars.arrow;

    const consumer_text = create_svg_el("text");
    consumer_text.setAttributeNS(null, "x", rendering.left_x);
    consumer_text.setAttributeNS(null, "y", rendering.text_y);
    consumer_text.setAttributeNS(null, "text-anchor", "middle");
    consumer_text.setAttributeNS(null, "font-size", rendering.font_size);
    consumer_text.classList.add("code");
    consumer_text.textContent = vars.pq_name;

    g.appendChild(consumer_text);
    g.appendChild(arrow_text);

    return g;
  }

  function build_consumer_markers_data(partition, pqs, styles, computed) {
    const { row_width, row_offset_right } = styles;
    const { consumer_m_margin_right, consumer_m_offset_bottom, consumer_m_margin_bottom } = styles;
    const { right_x, bottom_y } = computed;

    let this_bottom_y = bottom_y - consumer_m_offset_bottom;
    const result = [];

    pqs.forEach(pq_name => {
      const config = { partition, pq_name };
      const marker = build_data$2(config, styles, {
        left_x: right_x - row_offset_right - (row_width / 2) - consumer_m_margin_right,
        bottom_y: this_bottom_y
      });

      result.push(marker);
      this_bottom_y = marker.refs.top_y - consumer_m_margin_bottom;
    });

    return result;
  }

  function index_consumer_markers(consumer_markers_data) {
    return consumer_markers_data.reduce((all, marker) => {
      all[marker.vars.pq_name] = marker.id;
      return all;
    }, {});
  }

  function find_top_y(consumer_markers_data, top_y) {
    if (consumer_markers_data.length == 0) {
      return top_y;
    } else {
      return consumer_markers_data.slice(-1)[0].refs.top_y;
    }
  }

  function build_data$3(config, styles, computed) {
    const { partition, rows } = config;

    const { part_width, part_height,
            part_id_margin_top, part_id_margin_left,
            part_container_fill
          } = styles;
    const { row_height, row_width, row_margin_left, row_offset_right } = styles;
    const { font_size } = styles;

    const { successors, top_y, midpoint_x } = computed;

    const left_x = midpoint_x - (part_width / 2);
    const right_x = midpoint_x + (part_width / 2);
    const midpoint_y = top_y + (part_height / 2);

    let row_x = right_x - row_offset_right - row_width;
    let rows_data = [];

    rows.forEach(row => {
      row.card_viewable = true;

      rows_data.push(build_data$1(row, styles, {
        left_x: row_x,
        top_y: top_y,
      }));
      row_x -= (row_width + row_margin_left);
    });

    const consumer_markers_data = build_consumer_markers_data(partition, successors, styles, {
      right_x: right_x,
      bottom_y: midpoint_y - (row_height / 2)
    });

    const absolute_top_y = find_top_y(consumer_markers_data, top_y);
    const indexed_markers = index_consumer_markers(consumer_markers_data);

    return {
      kind: "partition",
      id: uuidv4(),
      rendering: {
        partition_label: {
          x: left_x + part_id_margin_left,
          y: top_y + part_id_margin_top
        },
        container: {
          x: left_x,
          y: top_y,
          rx: 10,
          width: part_width,
          height: part_height,
          fill: part_container_fill
        },
        font_size
      },
      vars: {
        partition_id: partition,
        indexed_consumer_markers: indexed_markers
      },
      refs: {
        top_y: absolute_top_y,
        midpoint_y: midpoint_y,
        right_x: right_x,
        left_x: left_x
      },
      children: {
        rows: rows_data,
        consumer_markers: consumer_markers_data
      }
    };
  }

  function render$3(data, styles, computed) {
    const { id, vars, rendering, children } = data;
    const { partition_label, container } = rendering;
    const { rows, consumer_markers } = children;

    const g = create_svg_el("g");
    g.id = id;
    g.classList.add("partition-container");

    const text = create_svg_el("text");
    text.setAttributeNS(null, "x", partition_label.x);
    text.setAttributeNS(null, "y", partition_label.y);
    text.setAttributeNS(null, "font-size", rendering.font_size);
    text.classList.add("code");
    text.textContent = vars.partition_id;

    const d_container = create_svg_el("rect");
    d_container.setAttributeNS(null, "x", container.x);
    d_container.setAttributeNS(null, "y", container.y);
    d_container.setAttributeNS(null, "rx", container.rx);
    d_container.setAttributeNS(null, "width", container.width);
    d_container.setAttributeNS(null, "height", container.height);
    d_container.setAttributeNS(null, "fill", container.fill);

    const rows_g = create_svg_el("g");
    rows_g.classList.add("rows");

    const d_rows = rows.map(row => render$1(row));
    d_rows.forEach(row => rows_g.appendChild(row));

    const markers_g = create_svg_el("g");
    markers_g.classList.add("consumer-markers");

    const d_consumer_markers = consumer_markers.map(marker => render$2(marker));
    d_consumer_markers.forEach(marker => markers_g.appendChild(marker));

    g.appendChild(text);
    g.appendChild(d_container);
    g.appendChild(rows_g);
    g.appendChild(markers_g);

    return g;
  }

  function build_data$4(config, styles, computed) {
    const { name } = config;
    const { coll_tip_len, coll_foot_len, coll_tip_margin_top } = styles;
    const { part_width, part_height, font_size } = styles;
    const { top_y, midpoint_x } = computed;

    const left_x = midpoint_x - (part_width / 2);
    const right_x = midpoint_x + (part_width / 2);

    const coll_tip_top_y = top_y + coll_tip_margin_top;
    const coll_tip_bottom_y = coll_tip_top_y + coll_tip_len;
    const coll_foot_bottom_y = coll_tip_bottom_y + coll_foot_len;

    return {
      kind: "stream_label",
      id: uuidv4(),
      rendering: {
        text: {
          x: midpoint_x,
          y: top_y
        },
        tip: {
          x1: midpoint_x,
          y1: coll_tip_top_y,
          x2: midpoint_x,
          y2: coll_tip_bottom_y
        },
        bar: {
          x1: left_x,
          y1: coll_tip_bottom_y,
          x2: right_x,
          y2: coll_tip_bottom_y
        },
        left_foot: {
          x1: left_x,
          y1: coll_tip_bottom_y,
          x2: left_x,
          y2: coll_foot_bottom_y
        },
        right_foot: {
          x1: right_x,
          y1: coll_tip_bottom_y,
          x2: right_x,
          y2: coll_foot_bottom_y
        },
        font_size
      },
      vars: {
        name: name
      },
      refs: {
        bottom_y: coll_foot_bottom_y
      }
    };
  }

  function render$4(data) {
    const { vars, rendering } = data;
    const { text, tip, bar, left_foot, right_foot } = rendering;

    const g = create_svg_el("g");
    g.classList.add("stream-label");

    const d_text = create_svg_el("text");
    d_text.setAttributeNS(null, "x", text.x);
    d_text.setAttributeNS(null, "y", text.y);
    d_text.setAttributeNS(null, "text-anchor", "middle");
    d_text.setAttributeNS(null, "font-size", rendering.font_size);
    d_text.classList.add("code");
    d_text.textContent = vars.name;

    const d_tip = create_svg_el("line");
    d_tip.setAttributeNS(null, "x1", tip.x1);
    d_tip.setAttributeNS(null, "y1", tip.y1);
    d_tip.setAttributeNS(null, "x2", tip.x2);
    d_tip.setAttributeNS(null, "y2", tip.y2);
    d_tip.classList.add("stream-connector");

    const d_bar = create_svg_el("line");
    d_bar.setAttributeNS(null, "x1", bar.x1);
    d_bar.setAttributeNS(null, "y1", bar.y1);
    d_bar.setAttributeNS(null, "x2", bar.x2);
    d_bar.setAttributeNS(null, "y2", bar.y2);
    d_bar.classList.add("stream-connector");

    const d_left_foot = create_svg_el("line");
    d_left_foot.setAttributeNS(null, "x1", left_foot.x1);
    d_left_foot.setAttributeNS(null, "y1", left_foot.y1);
    d_left_foot.setAttributeNS(null, "x2", left_foot.x2);
    d_left_foot.setAttributeNS(null, "y2", left_foot.y2);
    d_left_foot.classList.add("stream-connector");

    const d_right_foot = create_svg_el("line");
    d_right_foot.setAttributeNS(null, "x1", right_foot.x1);
    d_right_foot.setAttributeNS(null, "y1", right_foot.y1);
    d_right_foot.setAttributeNS(null, "x2", right_foot.x2);
    d_right_foot.setAttributeNS(null, "y2", right_foot.y2);
    d_right_foot.classList.add("stream-connector");

    g.appendChild(d_text);
    g.appendChild(d_tip);
    g.appendChild(d_bar);
    g.appendChild(d_left_foot);
    g.appendChild(d_right_foot);

    return g;
  }

  function build_data$5(config, styles, computed) {
    const { name, partitions } = config;
    const { coll_padding_top, coll_margin_bottom, coll_label_margin_bottom } = styles;
    const { part_height, part_margin_bottom } = styles;
    const { predecessors, successors, midpoint_x } = computed;

    const absolute_top_y = computed.top_y + coll_padding_top;
    let top_y_slide = absolute_top_y;

    const label_data = build_data$4({ name }, styles, {
      top_y: top_y_slide,
      midpoint_x: midpoint_x
    });

    top_y_slide = label_data.refs.bottom_y + coll_label_margin_bottom;

    let partitions_data = [];
    for (const [partition, rows] of Object.entries(partitions)) {
      const config = {
        partition: partition,
        rows: rows
      };

      const part_data = build_data$3(config, styles, {
        successors: successors,
        top_y: top_y_slide,
        midpoint_x: midpoint_x
      });
      partitions_data.push(part_data);
      top_y_slide += (part_height + part_margin_bottom);
    }

    const absolute_bottom_y = top_y_slide += coll_margin_bottom;

    return {
      kind: "stream",
      id: uuidv4(),
      name: name,
      refs: {
        top_y: absolute_top_y,
        bottom_y: absolute_bottom_y
      },
      children: {
        label: label_data,
        partitions: partitions_data
      },
      graph: {
        predecessors: predecessors,
        successors: successors
      }
    };
  }

  function render$5(data) {
    const { id, rendering, children } = data;
    const { label, partitions } = children;

    const g = create_svg_el("g");
    g.id = id;
    g.classList.add("stream-container");

    const d_label = render$4(label);
    const d_partitions = partitions.map(partition => render$3(partition));

    g.appendChild(d_label);
    d_partitions.forEach(partition => g.appendChild(partition));

    return g;
  }

  function build_data$6(config, styles, computed) {
    const { stream, partition } = config;
    const { left_x, top_y, bottom_margin } = computed;
    const { source_partitions_margin_left, font_size } = styles;

    return {
      kind: "source_partition_offset",
      id: uuidv4(),
      rendering: {
        x: left_x + source_partitions_margin_left,
        y: top_y,
        subtext_id: uuidv4(),
        font_size
      },
      vars: {
        stream: stream,
        partition: partition,
        label: `${stream}/${partition}: `,
        init: "-"
      },
      refs: {
        bottom_y: top_y + bottom_margin
      }
    };
  }

  function render$6(data) {
    const { id, vars, rendering } = data;

    const text = create_svg_el("text");
    text.id = id;
    text.setAttribute("data-stream", vars.stream);
    text.setAttribute("data-partition", vars.partition);
    text.setAttribute("x", rendering.x);
    text.setAttribute("y", rendering.y);
    text.setAttribute("font-size", rendering.font_size);
    text.classList.add("code");
    text.textContent = vars.label;

    const tspan = create_svg_el("tspan");
    tspan.id = rendering.subtext_id;
    tspan.textContent = vars.init;

    text.appendChild(tspan);

    return text;
  }

  function update_offset(source_partition, offset) {
    const { rendering, vars } = source_partition;
    const id = rendering.subtext_id;
    const el = document.getElementById(id);

    if (offset < 0) {
      el.textContent = vars.init;
    } else {
      el.textContent = offset;
    }
  }

  function build_data$7(config, styles, computed) {
    const { source_partitions } = config;
    const { source_partitions_fill } = styles;
    const { left_x, top_y, width, margin } = computed;
    let current_top_y = top_y + margin;

    const partitions = Object.entries(source_partitions).reduce((all, [stream, partitions]) => {
      partitions.forEach(partition => {
        const this_top_y = current_top_y;

        const config = {
          stream: stream,
          partition: partition
        };

        const this_computed = {
          left_x: left_x,
          top_y: this_top_y,
          bottom_margin: margin
        };

        all.push(build_data$6(config, styles, this_computed));
        current_top_y += margin;
      });

      return all;
    }, []);

    return {
      kind: "source_partitions",
      id: uuidv4(),
      rendering: {
        container: {
          x: left_x,
          y: top_y,
          rx: 10,
          width: width,
          height: current_top_y - top_y,
          fill: source_partitions_fill
        }
      },
      children: {
        partitions
      }
    };
  }

  function render$7(data) {
    const { id, rendering, children } = data;
    const { container } = rendering;
    const { partitions } = children;

    const g = create_svg_el("g");
    g.id = id;

    const d_container = create_svg_el("rect");
    d_container.setAttributeNS(null, "x", container.x);
    d_container.setAttributeNS(null, "y", container.y);
    d_container.setAttributeNS(null, "rx", container.rx);
    d_container.setAttributeNS(null, "width", container.width);
    d_container.setAttributeNS(null, "height", container.height);
    d_container.setAttributeNS(null, "fill", container.fill);

    g.appendChild(d_container);

    const d_partitions = partitions.map(p => render$6(p));
    d_partitions.forEach(p => g.appendChild(p));

    return g;
  }

  function build_data$8(config, styles, computed) {
    const { render_stream_time } = styles;
    const { left_x, top_y, bottom_margin } = computed;
    const bottom_y = top_y + bottom_margin;

    return {
      kind: "stream_time",
      id: uuidv4(),
      rendering: {
        x: left_x,
        y: top_y,
        subtext_id: uuidv4()
      },
      vars: {
        label: "ST: ",
        init: "-",
        viewable: render_stream_time
      },
      refs: {
        bottom_y: bottom_y
      }
    };
  }

  function render$8(data) {
    const { id, vars, rendering } = data;
    const { viewable } = vars;

    const text = create_svg_el("text");
    text.id = id;
    text.setAttributeNS(null, "x", rendering.x);
    text.setAttributeNS(null, "y", rendering.y);
    text.classList.add("code");
    text.textContent = vars.label;

    if (!viewable) {
      text.style.display = "none";
    }

    const tspan = create_svg_el("tspan");
    tspan.id = rendering.subtext_id;
    tspan.textContent = vars.init;

    text.appendChild(tspan);

    return text;
  }

  function update_time(stream_time, row) {
    const { rendering, vars } = stream_time;

    const id = rendering.subtext_id;  
    const el = document.getElementById(id);

    el.textContent = row.stream_time || vars.init;
  }

  function build_data$9(config, styles, computed) {
    const { aggregate, pq_style } = config;
    const { columns } = aggregate;
    const { materialized_view_height } = pq_style;
    const { mv_container_fill, mv_row_height, mv_margin_top, font_size } = styles;
    const { top_y, left_x, width } = computed;

    const bottom_y = top_y + materialized_view_height;
    // Three rows for upper dashes, headers, lower dashes.
    const next_y = mv_margin_top + (mv_row_height * 3);
    
    return {
      kind: "materialized_view",
      id: uuidv4(),
      rendering: {
        container: {
          x: left_x,
          y: top_y,
          rx: 10,
          width: width,
          height: materialized_view_height,
          fill: mv_container_fill
        },
        mv_margin_top,
        mv_row_height,
        mv_margin_top,
        font_size
      },
      vars: {
        columns,
        row_index: {},
        next_row_y: top_y + next_y,
      },
      refs: {
        left_x, bottom_y
      }
    }
  }

  const break_sym = "+";
  const col_sym = "|";
  const sep_sym = "-";

  function make_dashes(columns) {
    return columns.reduce((all, { width }) => {
      return all + break_sym + sep_sym.repeat(width);
    }, "") + break_sym;
  }
  function make_padding(s, width) {
    const spare = width - String(s).length;
    const pad = Math.max(0, spare / 2);
    const left = Math.ceil(pad);
    const right = Math.floor(pad);

    return [ left, right ];
  }

  function make_column_names(columns) {
    return columns.reduce((all, { name, width }) => {
      const [ left, right ] = make_padding(name, width);

      return all + col_sym + " ".repeat(left) + name + " ".repeat(right);
    }, "") + col_sym;
  }

  function make_row(columns, table_row) {
    return columns.reduce((all, { name, width }) => {
      const v = table_row[name];
      const [ left, right ] = make_padding(v, width);

      return all + col_sym + " ".repeat(left) + v + " ".repeat(right);
    }, "") + col_sym;
  }

  function render$9(data) {
    const { id, vars, rendering } = data;
    const { columns } = vars;
    const { container, mv_row_height, mv_margin_top } = rendering;
    
    const g = create_svg_el("g");
    g.id = id;

    const d_container = create_svg_el("rect");
    d_container.setAttributeNS(null, "x", container.x);
    d_container.setAttributeNS(null, "y", container.y);
    d_container.setAttributeNS(null, "rx", container.rx);
    d_container.setAttributeNS(null, "width", container.width);
    d_container.setAttributeNS(null, "height", container.height);
    d_container.setAttributeNS(null, "fill", container.fill);

    const d_dashes_upper = create_svg_el("text");
    d_dashes_upper.setAttributeNS(null, "x", container.x);
    d_dashes_upper.setAttributeNS(null, "y", container.y + mv_margin_top);
    d_dashes_upper.setAttributeNS(null, "font-size", rendering.font_size);
    d_dashes_upper.classList.add("code");
    d_dashes_upper.textContent = make_dashes(columns);

    const d_headers = create_svg_el("text");
    d_headers.setAttributeNS(null, "x", container.x);
    d_headers.setAttributeNS(null, "y", container.y + mv_margin_top + mv_row_height);
    d_headers.setAttributeNS(null, "font-size", rendering.font_size);
    d_headers.style.whiteSpace = "pre";
    d_headers.classList.add("code");
    d_headers.textContent = make_column_names(columns);

    const d_dashes_lower = create_svg_el("text");
    d_dashes_lower.setAttributeNS(null, "x", container.x);
    d_dashes_lower.setAttributeNS(null, "y", container.y + mv_margin_top + (mv_row_height * 2));
    d_dashes_lower.setAttributeNS(null, "font-size", rendering.font_size);
    d_dashes_lower.classList.add("code");
    d_dashes_lower.textContent = make_dashes(columns);
    
    g.appendChild(d_container);
    g.appendChild(d_dashes_upper);
    g.appendChild(d_headers);
    g.appendChild(d_dashes_lower);

    return g;
  }

  function update_table(mv, row) {
    const { id, rendering, vars } = mv;
    const { container, mv_row_height } = rendering;
    const { columns, row_index } = vars;
    const record = row.vars.record;

    const table_row = columns.reduce((all, column) => {
      all[column.name] = column.lookup(record);
      return all;
    }, {});

    row_index[record.key] = row_index[record.key] || {};
    row_index[record.key].data = table_row;

    if (row_index[record.key].id) {
      const d_row = document.getElementById(row_index[record.key].id);
      d_row.textContent = make_row(columns, table_row);
    } else {
      const el_id = uuidv4();
      
      const d_row = create_svg_el("text");
      d_row.id = el_id;
      d_row.setAttributeNS(null, "x", container.x);
      d_row.setAttributeNS(null, "y", vars.next_row_y);
      d_row.setAttributeNS(null, "font-size", rendering.font_size);
      d_row.style.whiteSpace = "pre";
      d_row.classList.add("code");
      d_row.textContent = make_row(columns, table_row);

      const el = document.getElementById(id);
      el.appendChild(d_row);
      
      vars.next_row_y += mv_row_height;
      row_index[record.key].id = el_id;
    }
  }

  function undo_row(mv, key, table_row) {
    const { vars, rendering } = mv;
    const { columns, row_index } = vars;
    const { mv_row_height } = rendering;

    const d_row = document.getElementById(row_index[key].id);

    if (table_row) {
      d_row.textContent = make_row(columns, table_row.data);
      row_index[key] = table_row;
    } else {
      row_index[key] = undefined;
      vars.next_row_y -= mv_row_height;
      d_row.remove();
    }
  }

  function build_data$a(config, styles, computed) {
    const { name, source_partitions, query_text, index, style: pq_style } = config;
    const { select, aggregate, into, where, partition_by } = config;

    const { pq_width, pq_height, pq_container_fill,
            pq_container_opacity, pq_margin_top
          } = styles;
    const { pq_label_margin_left, pq_label_margin_bottom } = styles;
    const { pq_metadata_offset_top, pq_metadata_margin_top } = styles;
    const { st_margin_top, st_margin_left } = styles;
    const { font_size } = styles;

    const { predecessors, successors, top_y, midpoint_x } = computed;

    const absolute_top_y = top_y + pq_margin_top;
    let top_y_slide = absolute_top_y;

    const box_bottom_y = top_y_slide + pq_height;
    const left_x = midpoint_x - (pq_width / 2);
    const right_x = midpoint_x + (pq_width / 2);
    const line_bottom_y = top_y_slide - 5;

    const metadata_top_y = box_bottom_y + pq_metadata_offset_top;
    const source_partitions_data = build_data$7({ source_partitions }, styles, {
      left_x: left_x,
      top_y: metadata_top_y,
      width: pq_width,
      margin: pq_metadata_margin_top
    });

    top_y_slide = source_partitions_data.children.partitions.slice(-1)[0].refs.bottom_y + pq_metadata_offset_top;
    const stream_time_data = build_data$8({}, styles, {
      left_x: left_x + st_margin_left,
      top_y: absolute_top_y + st_margin_top,
      bottom_margin: pq_metadata_margin_top
    });

    const children = {
      stream_time: stream_time_data,
      source_partitions: source_partitions_data,
    };

    if (aggregate) {
      const mv_data = build_data$9({ aggregate, pq_style }, styles, {
        top_y: top_y_slide,
        left_x: left_x,
        width: pq_width
      });
      top_y_slide = mv_data.refs.bottom_y;

      children.materialized_view = mv_data;
    }

    return {
      kind: "persistent_query",
      id: uuidv4(),
      name: name,
      rendering: {
        line: {
          x1: midpoint_x,
          y1: 0,
          x2: midpoint_x,
          y2: line_bottom_y
        },
        label: {
          name: name,
          x: left_x + pq_label_margin_left,
          y: absolute_top_y - pq_label_margin_bottom
        },
        container: {
          x: left_x,
          y: absolute_top_y,
          rx: 10,
          width: pq_width,
          height: pq_height,
          fill: pq_container_fill,
          opacity: pq_container_opacity
        },
        style: pq_style || {},
        top_component: index == 0,
        font_size
      },
      vars: {
        query_text: query_text,
        query_parts: {
          select,
          aggregate,
          into,
          where,
          partition_by
        },
        stateful: Boolean(aggregate)
      },
      children: children,
      graph: {
        predecessors: predecessors,
        successors: successors
      },
      refs: {
        top_y: absolute_top_y,
        bottom_y: top_y_slide,
        box_bottom_y: box_bottom_y,
        midpoint_y: box_bottom_y - (pq_height / 2),
        left_x: left_x,
        right_x: right_x,
        midpoint_x: midpoint_x
      }
    }
  }

  function render$a(data) {
    const { id, name, vars, rendering, children } = data;
    const { line, label, container } = rendering;
    const { stream_time, source_partitions, materialized_view } = children;

    const g = create_svg_el("g");
    g.id = id;
    g.classList.add("persistent-query-container");

    const d_line = create_svg_el("line");
    d_line.setAttributeNS(null, "x1", line.x1);
    d_line.setAttributeNS(null, "y1", line.y1);
    d_line.setAttributeNS(null, "x2", line.x2);
    d_line.setAttributeNS(null, "y2", line.y2);
    d_line.classList.add("pq-connector");

    const d_container = create_svg_el("rect");
    d_container.setAttributeNS(null, "x", container.x);
    d_container.setAttributeNS(null, "y", container.y);
    d_container.setAttributeNS(null, "rx", container.rx);
    d_container.setAttributeNS(null, "width", container.width);
    d_container.setAttributeNS(null, "height", container.height);
    d_container.setAttributeNS(null, "fill", container.fill);
    d_container.setAttributeNS(null, "opacity", container.opacity);

    const d_label = create_svg_el("text");
    d_label.setAttributeNS(null, "x", label.x);
    d_label.setAttributeNS(null, "y", label.y);
    d_label.setAttributeNS(null, "font-size", rendering.font_size);
    d_label.classList.add("code");
    d_label.textContent = name;

    const d_stream_time = render$8(stream_time);
    const d_source_partitions = render$7(source_partitions);

    if (rendering.top_component) {
      g.appendChild(d_line);
    }

    g.appendChild(d_container);
    g.appendChild(d_label);
    g.appendChild(d_stream_time);
    g.appendChild(d_source_partitions);

    if (materialized_view) {
      const d_materialized_view = render$9(materialized_view);
      g.appendChild(d_materialized_view);
    }

    return g;
  }

  function build_data$b(config, styles, computed) {
    const { seek_ms } = styles;
    const { timeline, callbacks } = computed;
    
    return {
      kind: "controls",
      id: uuidv4(),
      rendering: {
        play: {
          id: uuidv4(),
          text: "Play"
        },
        pause: {
          id: uuidv4(),
          text: "Pause"
        },
        restart: {
          id: uuidv4(),
          text: "Restart"
        },
        manual_left: {
          id: uuidv4(),
          text: "Manual <"
        },
        manual_right: {
          id: uuidv4(),
          text: "Manual >"
        },
        progress: {
          id: uuidv4(),
          min: 0,
          start: 0,
          step: .001
        }
      },
      vars: {
        timeline: timeline,
        callbacks: callbacks,
        seek_ms: seek_ms
      }
    };
  }

  function render$b(data) {
    const { id, rendering, vars } = data;
    const { timeline, callbacks, seek_ms } = vars;

    const div = document.createElement("div");
    div.id = id;
    div.classList.add("controls");

    const play = document.createElement("button");
    play.id = rendering.play.id;
    play.textContent = rendering.play.text;
    play.onclick = timeline.play;

    const pause = document.createElement("button");
    pause.id = rendering.pause.id;
    pause.textContent = rendering.pause.text;
    pause.onclick = timeline.pause;

    const restart = document.createElement("button");
    restart.id = rendering.restart.id;
    restart.textContent = rendering.restart.text;
    restart.onclick = timeline.restart;

    const manual_left = document.createElement("button");
    manual_left.id = rendering.manual_left.id;
    manual_left.textContent = rendering.manual_left.text;
    manual_left.onclick = () => {
      timeline.pause();
      timeline.seek(Math.max(0, timeline.currentTime - seek_ms));
    };

    // Continuously rewind animation while the rewind button is held down
    manual_left.onmousedown = () => {
      manual_left.interval = setInterval(() => {
        timeline.seek(Math.max(0, timeline.currentTime - seek_ms));
      }, 25);
    };
    manual_left.onmouseup = () => {
      if (manual_left.interval) {
        clearInterval(manual_left.interval);
      }
    };

    const manual_right = document.createElement("button");
    manual_right.id = rendering.manual_right.id;
    manual_right.textContent = rendering.manual_right.text;
    manual_right.onclick = () => {
      timeline.pause();
      timeline.seek(Math.min(timeline.duration, timeline.currentTime + seek_ms));
    };

    // Continuously play animation while the manual step forward button is held down
    manual_right.onmousedown = () => {
      manual_right.interval = setInterval(() => {
        timeline.seek(Math.max(0, timeline.currentTime + seek_ms));
      }, 25);
    };
    manual_right.onmouseup = () => {
      if (manual_right.interval) {
        clearInterval(manual_right.interval);
      }
    };

    const progress = document.createElement("input");
    progress.id = rendering.progress.id;
    progress.setAttribute("type", "range");
    progress.setAttribute("min", rendering.progress.min);
    progress.setAttribute("step", rendering.progress.step);
    progress.setAttribute("value", rendering.progress.start);
    progress.oninput = () => {
      const t = timeline.duration * (progress.valueAsNumber / 100);
      timeline.pause();
      timeline.seek(t);

      // Prevent sliding to end and back to middle completing the animation.
      if (t != timeline.duration) {
        timeline.completed = false;
      }
    };

    div.appendChild(play);
    div.appendChild(pause);
    div.appendChild(restart);
    div.appendChild(manual_left);
    div.appendChild(manual_right);
    div.appendChild(progress);

    return div;
  }

  function build_data$c(config, styles, computed) {
    const { svg_width, svg_height } = styles;

    return {
      kind: "svg",
      id: uuidv4(),
      name: "svg-container",
      rendering: {
        width: svg_width,
        height: svg_height
      }
    };
  }

  function render$c(data) {
    const { id, rendering } = data;
    const { width, height } = rendering;

    const svg = create_svg_el("svg");
    svg.id = id;
    svg.setAttributeNS(null, "width", width);
    svg.setAttributeNS(null, "height", height);
    svg.classList.add("animation");

    return svg;
  }

  const code_padding = 20;

  function build_data$d(config, styles, computed) {
    return {
      kind: "query-text",
      id: uuidv4(),
      name: "query-text"
    };
  }

  function make_code_container(code) {
    const new_code = document.createElement("code");
    new_code.classList.add("lang-sql");
    new_code.innerText = code.join("\n");

    const new_pre = document.createElement("pre");
    new_pre.style.position = "absolute";
    new_pre.style.bottom = "0";
    new_pre.style.left = "0";
    new_pre.style.right = "0";

    new_pre.style.marginLeft = "auto";
    new_pre.style.marginRight = "auto";
    new_pre.appendChild(new_code);

    return {
      pre: new_pre,
      code: new_code
    };
  }

  function make_parent_container(id, children) {
    const new_div = document.createElement("div");
    new_div.id = id;
    new_div.style.position = "relative";
    new_div.classList.add("pq-code-container");

    children.forEach(child => new_div.appendChild(child.pre));

    return new_div;
  }

  function set_pre_width({ pre, code }) {
    pre.style.width = `${code.offsetWidth + code_padding}px`;
  }

  function set_parent_height(parent, children) {
    const heights = children.map(child => child.pre.offsetHeight);
    const height = Math.max(...heights);
    parent.style.height = `${height}px`;
  }

  function set_pre_transform(pq, { pre }, svg_width) {
    const x = (pq.rendering.line.x1) - (svg_width / 2);

    pre.style.webkitTransform = `translateX(${x}px)`;
    pre.style.MozTransform = `translateX(${x}px)`;
    pre.style.msTransform = `translateX(${x}px)`;
    pre.style.OTransform = `translateX(${x}px)`;
    pre.style.transform = `translateX(${x}px)`;
  }

  function render$d(data, styles, computed) {
    const { id } = data;
    const { svg_width } = styles;
    const { layout, target } = computed;

    const pqs = layout.filter(component => {
      return (component.kind == "persistent_query") && component.rendering.top_component;
    });

    const children = pqs.map(pq => make_code_container(pq.vars.query_text));
    const parent = make_parent_container(id, children);

    target.insertAdjacentElement("beforebegin", parent);

    children.forEach(child => set_pre_width(child));
    set_parent_height(parent, children);

    pqs.forEach((pq, i) => set_pre_transform(pq, children[i], svg_width));

    return parent;
  }

  function build_data$e(config, styles, computed) {
    return {
      kind: "free",
      id: uuidv4(),
      rendering: {}
    };
  }

  function render$e(data) {
    const { id } = data;

    const g = create_svg_el("g");
    g.id = id;
    g.classList.add("free-objects");

    return g;
  }

  /**
   * Removes all key-value entries from the list cache.
   *
   * @private
   * @name clear
   * @memberOf ListCache
   */
  function listCacheClear() {
    this.__data__ = [];
    this.size = 0;
  }

  var _listCacheClear = listCacheClear;

  /**
   * Performs a
   * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
   * comparison between two values to determine if they are equivalent.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to compare.
   * @param {*} other The other value to compare.
   * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
   * @example
   *
   * var object = { 'a': 1 };
   * var other = { 'a': 1 };
   *
   * _.eq(object, object);
   * // => true
   *
   * _.eq(object, other);
   * // => false
   *
   * _.eq('a', 'a');
   * // => true
   *
   * _.eq('a', Object('a'));
   * // => false
   *
   * _.eq(NaN, NaN);
   * // => true
   */
  function eq(value, other) {
    return value === other || (value !== value && other !== other);
  }

  var eq_1 = eq;

  /**
   * Gets the index at which the `key` is found in `array` of key-value pairs.
   *
   * @private
   * @param {Array} array The array to inspect.
   * @param {*} key The key to search for.
   * @returns {number} Returns the index of the matched value, else `-1`.
   */
  function assocIndexOf(array, key) {
    var length = array.length;
    while (length--) {
      if (eq_1(array[length][0], key)) {
        return length;
      }
    }
    return -1;
  }

  var _assocIndexOf = assocIndexOf;

  /** Used for built-in method references. */
  var arrayProto = Array.prototype;

  /** Built-in value references. */
  var splice = arrayProto.splice;

  /**
   * Removes `key` and its value from the list cache.
   *
   * @private
   * @name delete
   * @memberOf ListCache
   * @param {string} key The key of the value to remove.
   * @returns {boolean} Returns `true` if the entry was removed, else `false`.
   */
  function listCacheDelete(key) {
    var data = this.__data__,
        index = _assocIndexOf(data, key);

    if (index < 0) {
      return false;
    }
    var lastIndex = data.length - 1;
    if (index == lastIndex) {
      data.pop();
    } else {
      splice.call(data, index, 1);
    }
    --this.size;
    return true;
  }

  var _listCacheDelete = listCacheDelete;

  /**
   * Gets the list cache value for `key`.
   *
   * @private
   * @name get
   * @memberOf ListCache
   * @param {string} key The key of the value to get.
   * @returns {*} Returns the entry value.
   */
  function listCacheGet(key) {
    var data = this.__data__,
        index = _assocIndexOf(data, key);

    return index < 0 ? undefined : data[index][1];
  }

  var _listCacheGet = listCacheGet;

  /**
   * Checks if a list cache value for `key` exists.
   *
   * @private
   * @name has
   * @memberOf ListCache
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function listCacheHas(key) {
    return _assocIndexOf(this.__data__, key) > -1;
  }

  var _listCacheHas = listCacheHas;

  /**
   * Sets the list cache `key` to `value`.
   *
   * @private
   * @name set
   * @memberOf ListCache
   * @param {string} key The key of the value to set.
   * @param {*} value The value to set.
   * @returns {Object} Returns the list cache instance.
   */
  function listCacheSet(key, value) {
    var data = this.__data__,
        index = _assocIndexOf(data, key);

    if (index < 0) {
      ++this.size;
      data.push([key, value]);
    } else {
      data[index][1] = value;
    }
    return this;
  }

  var _listCacheSet = listCacheSet;

  /**
   * Creates an list cache object.
   *
   * @private
   * @constructor
   * @param {Array} [entries] The key-value pairs to cache.
   */
  function ListCache(entries) {
    var index = -1,
        length = entries == null ? 0 : entries.length;

    this.clear();
    while (++index < length) {
      var entry = entries[index];
      this.set(entry[0], entry[1]);
    }
  }

  // Add methods to `ListCache`.
  ListCache.prototype.clear = _listCacheClear;
  ListCache.prototype['delete'] = _listCacheDelete;
  ListCache.prototype.get = _listCacheGet;
  ListCache.prototype.has = _listCacheHas;
  ListCache.prototype.set = _listCacheSet;

  var _ListCache = ListCache;

  /**
   * Removes all key-value entries from the stack.
   *
   * @private
   * @name clear
   * @memberOf Stack
   */
  function stackClear() {
    this.__data__ = new _ListCache;
    this.size = 0;
  }

  var _stackClear = stackClear;

  /**
   * Removes `key` and its value from the stack.
   *
   * @private
   * @name delete
   * @memberOf Stack
   * @param {string} key The key of the value to remove.
   * @returns {boolean} Returns `true` if the entry was removed, else `false`.
   */
  function stackDelete(key) {
    var data = this.__data__,
        result = data['delete'](key);

    this.size = data.size;
    return result;
  }

  var _stackDelete = stackDelete;

  /**
   * Gets the stack value for `key`.
   *
   * @private
   * @name get
   * @memberOf Stack
   * @param {string} key The key of the value to get.
   * @returns {*} Returns the entry value.
   */
  function stackGet(key) {
    return this.__data__.get(key);
  }

  var _stackGet = stackGet;

  /**
   * Checks if a stack value for `key` exists.
   *
   * @private
   * @name has
   * @memberOf Stack
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function stackHas(key) {
    return this.__data__.has(key);
  }

  var _stackHas = stackHas;

  var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

  function commonjsRequire () {
  	throw new Error('Dynamic requires are not currently supported by rollup-plugin-commonjs');
  }

  function createCommonjsModule(fn, module) {
  	return module = { exports: {} }, fn(module, module.exports), module.exports;
  }

  /** Detect free variable `global` from Node.js. */
  var freeGlobal = typeof commonjsGlobal == 'object' && commonjsGlobal && commonjsGlobal.Object === Object && commonjsGlobal;

  var _freeGlobal = freeGlobal;

  /** Detect free variable `self`. */
  var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

  /** Used as a reference to the global object. */
  var root = _freeGlobal || freeSelf || Function('return this')();

  var _root = root;

  /** Built-in value references. */
  var Symbol$1 = _root.Symbol;

  var _Symbol = Symbol$1;

  /** Used for built-in method references. */
  var objectProto = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty = objectProto.hasOwnProperty;

  /**
   * Used to resolve the
   * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
   * of values.
   */
  var nativeObjectToString = objectProto.toString;

  /** Built-in value references. */
  var symToStringTag = _Symbol ? _Symbol.toStringTag : undefined;

  /**
   * A specialized version of `baseGetTag` which ignores `Symbol.toStringTag` values.
   *
   * @private
   * @param {*} value The value to query.
   * @returns {string} Returns the raw `toStringTag`.
   */
  function getRawTag(value) {
    var isOwn = hasOwnProperty.call(value, symToStringTag),
        tag = value[symToStringTag];

    try {
      value[symToStringTag] = undefined;
      var unmasked = true;
    } catch (e) {}

    var result = nativeObjectToString.call(value);
    if (unmasked) {
      if (isOwn) {
        value[symToStringTag] = tag;
      } else {
        delete value[symToStringTag];
      }
    }
    return result;
  }

  var _getRawTag = getRawTag;

  /** Used for built-in method references. */
  var objectProto$1 = Object.prototype;

  /**
   * Used to resolve the
   * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
   * of values.
   */
  var nativeObjectToString$1 = objectProto$1.toString;

  /**
   * Converts `value` to a string using `Object.prototype.toString`.
   *
   * @private
   * @param {*} value The value to convert.
   * @returns {string} Returns the converted string.
   */
  function objectToString(value) {
    return nativeObjectToString$1.call(value);
  }

  var _objectToString = objectToString;

  /** `Object#toString` result references. */
  var nullTag = '[object Null]',
      undefinedTag = '[object Undefined]';

  /** Built-in value references. */
  var symToStringTag$1 = _Symbol ? _Symbol.toStringTag : undefined;

  /**
   * The base implementation of `getTag` without fallbacks for buggy environments.
   *
   * @private
   * @param {*} value The value to query.
   * @returns {string} Returns the `toStringTag`.
   */
  function baseGetTag(value) {
    if (value == null) {
      return value === undefined ? undefinedTag : nullTag;
    }
    return (symToStringTag$1 && symToStringTag$1 in Object(value))
      ? _getRawTag(value)
      : _objectToString(value);
  }

  var _baseGetTag = baseGetTag;

  /**
   * Checks if `value` is the
   * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
   * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an object, else `false`.
   * @example
   *
   * _.isObject({});
   * // => true
   *
   * _.isObject([1, 2, 3]);
   * // => true
   *
   * _.isObject(_.noop);
   * // => true
   *
   * _.isObject(null);
   * // => false
   */
  function isObject(value) {
    var type = typeof value;
    return value != null && (type == 'object' || type == 'function');
  }

  var isObject_1 = isObject;

  /** `Object#toString` result references. */
  var asyncTag = '[object AsyncFunction]',
      funcTag = '[object Function]',
      genTag = '[object GeneratorFunction]',
      proxyTag = '[object Proxy]';

  /**
   * Checks if `value` is classified as a `Function` object.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a function, else `false`.
   * @example
   *
   * _.isFunction(_);
   * // => true
   *
   * _.isFunction(/abc/);
   * // => false
   */
  function isFunction(value) {
    if (!isObject_1(value)) {
      return false;
    }
    // The use of `Object#toString` avoids issues with the `typeof` operator
    // in Safari 9 which returns 'object' for typed arrays and other constructors.
    var tag = _baseGetTag(value);
    return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
  }

  var isFunction_1 = isFunction;

  /** Used to detect overreaching core-js shims. */
  var coreJsData = _root['__core-js_shared__'];

  var _coreJsData = coreJsData;

  /** Used to detect methods masquerading as native. */
  var maskSrcKey = (function() {
    var uid = /[^.]+$/.exec(_coreJsData && _coreJsData.keys && _coreJsData.keys.IE_PROTO || '');
    return uid ? ('Symbol(src)_1.' + uid) : '';
  }());

  /**
   * Checks if `func` has its source masked.
   *
   * @private
   * @param {Function} func The function to check.
   * @returns {boolean} Returns `true` if `func` is masked, else `false`.
   */
  function isMasked(func) {
    return !!maskSrcKey && (maskSrcKey in func);
  }

  var _isMasked = isMasked;

  /** Used for built-in method references. */
  var funcProto = Function.prototype;

  /** Used to resolve the decompiled source of functions. */
  var funcToString = funcProto.toString;

  /**
   * Converts `func` to its source code.
   *
   * @private
   * @param {Function} func The function to convert.
   * @returns {string} Returns the source code.
   */
  function toSource(func) {
    if (func != null) {
      try {
        return funcToString.call(func);
      } catch (e) {}
      try {
        return (func + '');
      } catch (e) {}
    }
    return '';
  }

  var _toSource = toSource;

  /**
   * Used to match `RegExp`
   * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
   */
  var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

  /** Used to detect host constructors (Safari). */
  var reIsHostCtor = /^\[object .+?Constructor\]$/;

  /** Used for built-in method references. */
  var funcProto$1 = Function.prototype,
      objectProto$2 = Object.prototype;

  /** Used to resolve the decompiled source of functions. */
  var funcToString$1 = funcProto$1.toString;

  /** Used to check objects for own properties. */
  var hasOwnProperty$1 = objectProto$2.hasOwnProperty;

  /** Used to detect if a method is native. */
  var reIsNative = RegExp('^' +
    funcToString$1.call(hasOwnProperty$1).replace(reRegExpChar, '\\$&')
    .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
  );

  /**
   * The base implementation of `_.isNative` without bad shim checks.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a native function,
   *  else `false`.
   */
  function baseIsNative(value) {
    if (!isObject_1(value) || _isMasked(value)) {
      return false;
    }
    var pattern = isFunction_1(value) ? reIsNative : reIsHostCtor;
    return pattern.test(_toSource(value));
  }

  var _baseIsNative = baseIsNative;

  /**
   * Gets the value at `key` of `object`.
   *
   * @private
   * @param {Object} [object] The object to query.
   * @param {string} key The key of the property to get.
   * @returns {*} Returns the property value.
   */
  function getValue(object, key) {
    return object == null ? undefined : object[key];
  }

  var _getValue = getValue;

  /**
   * Gets the native function at `key` of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @param {string} key The key of the method to get.
   * @returns {*} Returns the function if it's native, else `undefined`.
   */
  function getNative(object, key) {
    var value = _getValue(object, key);
    return _baseIsNative(value) ? value : undefined;
  }

  var _getNative = getNative;

  /* Built-in method references that are verified to be native. */
  var Map$1 = _getNative(_root, 'Map');

  var _Map = Map$1;

  /* Built-in method references that are verified to be native. */
  var nativeCreate = _getNative(Object, 'create');

  var _nativeCreate = nativeCreate;

  /**
   * Removes all key-value entries from the hash.
   *
   * @private
   * @name clear
   * @memberOf Hash
   */
  function hashClear() {
    this.__data__ = _nativeCreate ? _nativeCreate(null) : {};
    this.size = 0;
  }

  var _hashClear = hashClear;

  /**
   * Removes `key` and its value from the hash.
   *
   * @private
   * @name delete
   * @memberOf Hash
   * @param {Object} hash The hash to modify.
   * @param {string} key The key of the value to remove.
   * @returns {boolean} Returns `true` if the entry was removed, else `false`.
   */
  function hashDelete(key) {
    var result = this.has(key) && delete this.__data__[key];
    this.size -= result ? 1 : 0;
    return result;
  }

  var _hashDelete = hashDelete;

  /** Used to stand-in for `undefined` hash values. */
  var HASH_UNDEFINED = '__lodash_hash_undefined__';

  /** Used for built-in method references. */
  var objectProto$3 = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$2 = objectProto$3.hasOwnProperty;

  /**
   * Gets the hash value for `key`.
   *
   * @private
   * @name get
   * @memberOf Hash
   * @param {string} key The key of the value to get.
   * @returns {*} Returns the entry value.
   */
  function hashGet(key) {
    var data = this.__data__;
    if (_nativeCreate) {
      var result = data[key];
      return result === HASH_UNDEFINED ? undefined : result;
    }
    return hasOwnProperty$2.call(data, key) ? data[key] : undefined;
  }

  var _hashGet = hashGet;

  /** Used for built-in method references. */
  var objectProto$4 = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$3 = objectProto$4.hasOwnProperty;

  /**
   * Checks if a hash value for `key` exists.
   *
   * @private
   * @name has
   * @memberOf Hash
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function hashHas(key) {
    var data = this.__data__;
    return _nativeCreate ? (data[key] !== undefined) : hasOwnProperty$3.call(data, key);
  }

  var _hashHas = hashHas;

  /** Used to stand-in for `undefined` hash values. */
  var HASH_UNDEFINED$1 = '__lodash_hash_undefined__';

  /**
   * Sets the hash `key` to `value`.
   *
   * @private
   * @name set
   * @memberOf Hash
   * @param {string} key The key of the value to set.
   * @param {*} value The value to set.
   * @returns {Object} Returns the hash instance.
   */
  function hashSet(key, value) {
    var data = this.__data__;
    this.size += this.has(key) ? 0 : 1;
    data[key] = (_nativeCreate && value === undefined) ? HASH_UNDEFINED$1 : value;
    return this;
  }

  var _hashSet = hashSet;

  /**
   * Creates a hash object.
   *
   * @private
   * @constructor
   * @param {Array} [entries] The key-value pairs to cache.
   */
  function Hash(entries) {
    var index = -1,
        length = entries == null ? 0 : entries.length;

    this.clear();
    while (++index < length) {
      var entry = entries[index];
      this.set(entry[0], entry[1]);
    }
  }

  // Add methods to `Hash`.
  Hash.prototype.clear = _hashClear;
  Hash.prototype['delete'] = _hashDelete;
  Hash.prototype.get = _hashGet;
  Hash.prototype.has = _hashHas;
  Hash.prototype.set = _hashSet;

  var _Hash = Hash;

  /**
   * Removes all key-value entries from the map.
   *
   * @private
   * @name clear
   * @memberOf MapCache
   */
  function mapCacheClear() {
    this.size = 0;
    this.__data__ = {
      'hash': new _Hash,
      'map': new (_Map || _ListCache),
      'string': new _Hash
    };
  }

  var _mapCacheClear = mapCacheClear;

  /**
   * Checks if `value` is suitable for use as unique object key.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
   */
  function isKeyable(value) {
    var type = typeof value;
    return (type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean')
      ? (value !== '__proto__')
      : (value === null);
  }

  var _isKeyable = isKeyable;

  /**
   * Gets the data for `map`.
   *
   * @private
   * @param {Object} map The map to query.
   * @param {string} key The reference key.
   * @returns {*} Returns the map data.
   */
  function getMapData(map, key) {
    var data = map.__data__;
    return _isKeyable(key)
      ? data[typeof key == 'string' ? 'string' : 'hash']
      : data.map;
  }

  var _getMapData = getMapData;

  /**
   * Removes `key` and its value from the map.
   *
   * @private
   * @name delete
   * @memberOf MapCache
   * @param {string} key The key of the value to remove.
   * @returns {boolean} Returns `true` if the entry was removed, else `false`.
   */
  function mapCacheDelete(key) {
    var result = _getMapData(this, key)['delete'](key);
    this.size -= result ? 1 : 0;
    return result;
  }

  var _mapCacheDelete = mapCacheDelete;

  /**
   * Gets the map value for `key`.
   *
   * @private
   * @name get
   * @memberOf MapCache
   * @param {string} key The key of the value to get.
   * @returns {*} Returns the entry value.
   */
  function mapCacheGet(key) {
    return _getMapData(this, key).get(key);
  }

  var _mapCacheGet = mapCacheGet;

  /**
   * Checks if a map value for `key` exists.
   *
   * @private
   * @name has
   * @memberOf MapCache
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function mapCacheHas(key) {
    return _getMapData(this, key).has(key);
  }

  var _mapCacheHas = mapCacheHas;

  /**
   * Sets the map `key` to `value`.
   *
   * @private
   * @name set
   * @memberOf MapCache
   * @param {string} key The key of the value to set.
   * @param {*} value The value to set.
   * @returns {Object} Returns the map cache instance.
   */
  function mapCacheSet(key, value) {
    var data = _getMapData(this, key),
        size = data.size;

    data.set(key, value);
    this.size += data.size == size ? 0 : 1;
    return this;
  }

  var _mapCacheSet = mapCacheSet;

  /**
   * Creates a map cache object to store key-value pairs.
   *
   * @private
   * @constructor
   * @param {Array} [entries] The key-value pairs to cache.
   */
  function MapCache(entries) {
    var index = -1,
        length = entries == null ? 0 : entries.length;

    this.clear();
    while (++index < length) {
      var entry = entries[index];
      this.set(entry[0], entry[1]);
    }
  }

  // Add methods to `MapCache`.
  MapCache.prototype.clear = _mapCacheClear;
  MapCache.prototype['delete'] = _mapCacheDelete;
  MapCache.prototype.get = _mapCacheGet;
  MapCache.prototype.has = _mapCacheHas;
  MapCache.prototype.set = _mapCacheSet;

  var _MapCache = MapCache;

  /** Used as the size to enable large array optimizations. */
  var LARGE_ARRAY_SIZE = 200;

  /**
   * Sets the stack `key` to `value`.
   *
   * @private
   * @name set
   * @memberOf Stack
   * @param {string} key The key of the value to set.
   * @param {*} value The value to set.
   * @returns {Object} Returns the stack cache instance.
   */
  function stackSet(key, value) {
    var data = this.__data__;
    if (data instanceof _ListCache) {
      var pairs = data.__data__;
      if (!_Map || (pairs.length < LARGE_ARRAY_SIZE - 1)) {
        pairs.push([key, value]);
        this.size = ++data.size;
        return this;
      }
      data = this.__data__ = new _MapCache(pairs);
    }
    data.set(key, value);
    this.size = data.size;
    return this;
  }

  var _stackSet = stackSet;

  /**
   * Creates a stack cache object to store key-value pairs.
   *
   * @private
   * @constructor
   * @param {Array} [entries] The key-value pairs to cache.
   */
  function Stack(entries) {
    var data = this.__data__ = new _ListCache(entries);
    this.size = data.size;
  }

  // Add methods to `Stack`.
  Stack.prototype.clear = _stackClear;
  Stack.prototype['delete'] = _stackDelete;
  Stack.prototype.get = _stackGet;
  Stack.prototype.has = _stackHas;
  Stack.prototype.set = _stackSet;

  var _Stack = Stack;

  /**
   * A specialized version of `_.forEach` for arrays without support for
   * iteratee shorthands.
   *
   * @private
   * @param {Array} [array] The array to iterate over.
   * @param {Function} iteratee The function invoked per iteration.
   * @returns {Array} Returns `array`.
   */
  function arrayEach(array, iteratee) {
    var index = -1,
        length = array == null ? 0 : array.length;

    while (++index < length) {
      if (iteratee(array[index], index, array) === false) {
        break;
      }
    }
    return array;
  }

  var _arrayEach = arrayEach;

  var defineProperty = (function() {
    try {
      var func = _getNative(Object, 'defineProperty');
      func({}, '', {});
      return func;
    } catch (e) {}
  }());

  var _defineProperty = defineProperty;

  /**
   * The base implementation of `assignValue` and `assignMergeValue` without
   * value checks.
   *
   * @private
   * @param {Object} object The object to modify.
   * @param {string} key The key of the property to assign.
   * @param {*} value The value to assign.
   */
  function baseAssignValue(object, key, value) {
    if (key == '__proto__' && _defineProperty) {
      _defineProperty(object, key, {
        'configurable': true,
        'enumerable': true,
        'value': value,
        'writable': true
      });
    } else {
      object[key] = value;
    }
  }

  var _baseAssignValue = baseAssignValue;

  /** Used for built-in method references. */
  var objectProto$5 = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$4 = objectProto$5.hasOwnProperty;

  /**
   * Assigns `value` to `key` of `object` if the existing value is not equivalent
   * using [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
   * for equality comparisons.
   *
   * @private
   * @param {Object} object The object to modify.
   * @param {string} key The key of the property to assign.
   * @param {*} value The value to assign.
   */
  function assignValue(object, key, value) {
    var objValue = object[key];
    if (!(hasOwnProperty$4.call(object, key) && eq_1(objValue, value)) ||
        (value === undefined && !(key in object))) {
      _baseAssignValue(object, key, value);
    }
  }

  var _assignValue = assignValue;

  /**
   * Copies properties of `source` to `object`.
   *
   * @private
   * @param {Object} source The object to copy properties from.
   * @param {Array} props The property identifiers to copy.
   * @param {Object} [object={}] The object to copy properties to.
   * @param {Function} [customizer] The function to customize copied values.
   * @returns {Object} Returns `object`.
   */
  function copyObject(source, props, object, customizer) {
    var isNew = !object;
    object || (object = {});

    var index = -1,
        length = props.length;

    while (++index < length) {
      var key = props[index];

      var newValue = customizer
        ? customizer(object[key], source[key], key, object, source)
        : undefined;

      if (newValue === undefined) {
        newValue = source[key];
      }
      if (isNew) {
        _baseAssignValue(object, key, newValue);
      } else {
        _assignValue(object, key, newValue);
      }
    }
    return object;
  }

  var _copyObject = copyObject;

  /**
   * The base implementation of `_.times` without support for iteratee shorthands
   * or max array length checks.
   *
   * @private
   * @param {number} n The number of times to invoke `iteratee`.
   * @param {Function} iteratee The function invoked per iteration.
   * @returns {Array} Returns the array of results.
   */
  function baseTimes(n, iteratee) {
    var index = -1,
        result = Array(n);

    while (++index < n) {
      result[index] = iteratee(index);
    }
    return result;
  }

  var _baseTimes = baseTimes;

  /**
   * Checks if `value` is object-like. A value is object-like if it's not `null`
   * and has a `typeof` result of "object".
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
   * @example
   *
   * _.isObjectLike({});
   * // => true
   *
   * _.isObjectLike([1, 2, 3]);
   * // => true
   *
   * _.isObjectLike(_.noop);
   * // => false
   *
   * _.isObjectLike(null);
   * // => false
   */
  function isObjectLike(value) {
    return value != null && typeof value == 'object';
  }

  var isObjectLike_1 = isObjectLike;

  /** `Object#toString` result references. */
  var argsTag = '[object Arguments]';

  /**
   * The base implementation of `_.isArguments`.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an `arguments` object,
   */
  function baseIsArguments(value) {
    return isObjectLike_1(value) && _baseGetTag(value) == argsTag;
  }

  var _baseIsArguments = baseIsArguments;

  /** Used for built-in method references. */
  var objectProto$6 = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$5 = objectProto$6.hasOwnProperty;

  /** Built-in value references. */
  var propertyIsEnumerable = objectProto$6.propertyIsEnumerable;

  /**
   * Checks if `value` is likely an `arguments` object.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an `arguments` object,
   *  else `false`.
   * @example
   *
   * _.isArguments(function() { return arguments; }());
   * // => true
   *
   * _.isArguments([1, 2, 3]);
   * // => false
   */
  var isArguments = _baseIsArguments(function() { return arguments; }()) ? _baseIsArguments : function(value) {
    return isObjectLike_1(value) && hasOwnProperty$5.call(value, 'callee') &&
      !propertyIsEnumerable.call(value, 'callee');
  };

  var isArguments_1 = isArguments;

  /**
   * Checks if `value` is classified as an `Array` object.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an array, else `false`.
   * @example
   *
   * _.isArray([1, 2, 3]);
   * // => true
   *
   * _.isArray(document.body.children);
   * // => false
   *
   * _.isArray('abc');
   * // => false
   *
   * _.isArray(_.noop);
   * // => false
   */
  var isArray = Array.isArray;

  var isArray_1 = isArray;

  /**
   * This method returns `false`.
   *
   * @static
   * @memberOf _
   * @since 4.13.0
   * @category Util
   * @returns {boolean} Returns `false`.
   * @example
   *
   * _.times(2, _.stubFalse);
   * // => [false, false]
   */
  function stubFalse() {
    return false;
  }

  var stubFalse_1 = stubFalse;

  var isBuffer_1 = createCommonjsModule(function (module, exports) {
  /** Detect free variable `exports`. */
  var freeExports =  exports && !exports.nodeType && exports;

  /** Detect free variable `module`. */
  var freeModule = freeExports && 'object' == 'object' && module && !module.nodeType && module;

  /** Detect the popular CommonJS extension `module.exports`. */
  var moduleExports = freeModule && freeModule.exports === freeExports;

  /** Built-in value references. */
  var Buffer = moduleExports ? _root.Buffer : undefined;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeIsBuffer = Buffer ? Buffer.isBuffer : undefined;

  /**
   * Checks if `value` is a buffer.
   *
   * @static
   * @memberOf _
   * @since 4.3.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a buffer, else `false`.
   * @example
   *
   * _.isBuffer(new Buffer(2));
   * // => true
   *
   * _.isBuffer(new Uint8Array(2));
   * // => false
   */
  var isBuffer = nativeIsBuffer || stubFalse_1;

  module.exports = isBuffer;
  });

  /** Used as references for various `Number` constants. */
  var MAX_SAFE_INTEGER = 9007199254740991;

  /** Used to detect unsigned integer values. */
  var reIsUint = /^(?:0|[1-9]\d*)$/;

  /**
   * Checks if `value` is a valid array-like index.
   *
   * @private
   * @param {*} value The value to check.
   * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
   * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
   */
  function isIndex(value, length) {
    var type = typeof value;
    length = length == null ? MAX_SAFE_INTEGER : length;

    return !!length &&
      (type == 'number' ||
        (type != 'symbol' && reIsUint.test(value))) &&
          (value > -1 && value % 1 == 0 && value < length);
  }

  var _isIndex = isIndex;

  /** Used as references for various `Number` constants. */
  var MAX_SAFE_INTEGER$1 = 9007199254740991;

  /**
   * Checks if `value` is a valid array-like length.
   *
   * **Note:** This method is loosely based on
   * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
   * @example
   *
   * _.isLength(3);
   * // => true
   *
   * _.isLength(Number.MIN_VALUE);
   * // => false
   *
   * _.isLength(Infinity);
   * // => false
   *
   * _.isLength('3');
   * // => false
   */
  function isLength(value) {
    return typeof value == 'number' &&
      value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER$1;
  }

  var isLength_1 = isLength;

  /** `Object#toString` result references. */
  var argsTag$1 = '[object Arguments]',
      arrayTag = '[object Array]',
      boolTag = '[object Boolean]',
      dateTag = '[object Date]',
      errorTag = '[object Error]',
      funcTag$1 = '[object Function]',
      mapTag = '[object Map]',
      numberTag = '[object Number]',
      objectTag = '[object Object]',
      regexpTag = '[object RegExp]',
      setTag = '[object Set]',
      stringTag = '[object String]',
      weakMapTag = '[object WeakMap]';

  var arrayBufferTag = '[object ArrayBuffer]',
      dataViewTag = '[object DataView]',
      float32Tag = '[object Float32Array]',
      float64Tag = '[object Float64Array]',
      int8Tag = '[object Int8Array]',
      int16Tag = '[object Int16Array]',
      int32Tag = '[object Int32Array]',
      uint8Tag = '[object Uint8Array]',
      uint8ClampedTag = '[object Uint8ClampedArray]',
      uint16Tag = '[object Uint16Array]',
      uint32Tag = '[object Uint32Array]';

  /** Used to identify `toStringTag` values of typed arrays. */
  var typedArrayTags = {};
  typedArrayTags[float32Tag] = typedArrayTags[float64Tag] =
  typedArrayTags[int8Tag] = typedArrayTags[int16Tag] =
  typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] =
  typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] =
  typedArrayTags[uint32Tag] = true;
  typedArrayTags[argsTag$1] = typedArrayTags[arrayTag] =
  typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] =
  typedArrayTags[dataViewTag] = typedArrayTags[dateTag] =
  typedArrayTags[errorTag] = typedArrayTags[funcTag$1] =
  typedArrayTags[mapTag] = typedArrayTags[numberTag] =
  typedArrayTags[objectTag] = typedArrayTags[regexpTag] =
  typedArrayTags[setTag] = typedArrayTags[stringTag] =
  typedArrayTags[weakMapTag] = false;

  /**
   * The base implementation of `_.isTypedArray` without Node.js optimizations.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
   */
  function baseIsTypedArray(value) {
    return isObjectLike_1(value) &&
      isLength_1(value.length) && !!typedArrayTags[_baseGetTag(value)];
  }

  var _baseIsTypedArray = baseIsTypedArray;

  /**
   * The base implementation of `_.unary` without support for storing metadata.
   *
   * @private
   * @param {Function} func The function to cap arguments for.
   * @returns {Function} Returns the new capped function.
   */
  function baseUnary(func) {
    return function(value) {
      return func(value);
    };
  }

  var _baseUnary = baseUnary;

  var _nodeUtil = createCommonjsModule(function (module, exports) {
  /** Detect free variable `exports`. */
  var freeExports =  exports && !exports.nodeType && exports;

  /** Detect free variable `module`. */
  var freeModule = freeExports && 'object' == 'object' && module && !module.nodeType && module;

  /** Detect the popular CommonJS extension `module.exports`. */
  var moduleExports = freeModule && freeModule.exports === freeExports;

  /** Detect free variable `process` from Node.js. */
  var freeProcess = moduleExports && _freeGlobal.process;

  /** Used to access faster Node.js helpers. */
  var nodeUtil = (function() {
    try {
      // Use `util.types` for Node.js 10+.
      var types = freeModule && freeModule.require && freeModule.require('util').types;

      if (types) {
        return types;
      }

      // Legacy `process.binding('util')` for Node.js < 10.
      return freeProcess && freeProcess.binding && freeProcess.binding('util');
    } catch (e) {}
  }());

  module.exports = nodeUtil;
  });

  /* Node.js helper references. */
  var nodeIsTypedArray = _nodeUtil && _nodeUtil.isTypedArray;

  /**
   * Checks if `value` is classified as a typed array.
   *
   * @static
   * @memberOf _
   * @since 3.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
   * @example
   *
   * _.isTypedArray(new Uint8Array);
   * // => true
   *
   * _.isTypedArray([]);
   * // => false
   */
  var isTypedArray = nodeIsTypedArray ? _baseUnary(nodeIsTypedArray) : _baseIsTypedArray;

  var isTypedArray_1 = isTypedArray;

  /** Used for built-in method references. */
  var objectProto$7 = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$6 = objectProto$7.hasOwnProperty;

  /**
   * Creates an array of the enumerable property names of the array-like `value`.
   *
   * @private
   * @param {*} value The value to query.
   * @param {boolean} inherited Specify returning inherited property names.
   * @returns {Array} Returns the array of property names.
   */
  function arrayLikeKeys(value, inherited) {
    var isArr = isArray_1(value),
        isArg = !isArr && isArguments_1(value),
        isBuff = !isArr && !isArg && isBuffer_1(value),
        isType = !isArr && !isArg && !isBuff && isTypedArray_1(value),
        skipIndexes = isArr || isArg || isBuff || isType,
        result = skipIndexes ? _baseTimes(value.length, String) : [],
        length = result.length;

    for (var key in value) {
      if ((inherited || hasOwnProperty$6.call(value, key)) &&
          !(skipIndexes && (
             // Safari 9 has enumerable `arguments.length` in strict mode.
             key == 'length' ||
             // Node.js 0.10 has enumerable non-index properties on buffers.
             (isBuff && (key == 'offset' || key == 'parent')) ||
             // PhantomJS 2 has enumerable non-index properties on typed arrays.
             (isType && (key == 'buffer' || key == 'byteLength' || key == 'byteOffset')) ||
             // Skip index properties.
             _isIndex(key, length)
          ))) {
        result.push(key);
      }
    }
    return result;
  }

  var _arrayLikeKeys = arrayLikeKeys;

  /** Used for built-in method references. */
  var objectProto$8 = Object.prototype;

  /**
   * Checks if `value` is likely a prototype object.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a prototype, else `false`.
   */
  function isPrototype(value) {
    var Ctor = value && value.constructor,
        proto = (typeof Ctor == 'function' && Ctor.prototype) || objectProto$8;

    return value === proto;
  }

  var _isPrototype = isPrototype;

  /**
   * Creates a unary function that invokes `func` with its argument transformed.
   *
   * @private
   * @param {Function} func The function to wrap.
   * @param {Function} transform The argument transform.
   * @returns {Function} Returns the new function.
   */
  function overArg(func, transform) {
    return function(arg) {
      return func(transform(arg));
    };
  }

  var _overArg = overArg;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeKeys = _overArg(Object.keys, Object);

  var _nativeKeys = nativeKeys;

  /** Used for built-in method references. */
  var objectProto$9 = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$7 = objectProto$9.hasOwnProperty;

  /**
   * The base implementation of `_.keys` which doesn't treat sparse arrays as dense.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names.
   */
  function baseKeys(object) {
    if (!_isPrototype(object)) {
      return _nativeKeys(object);
    }
    var result = [];
    for (var key in Object(object)) {
      if (hasOwnProperty$7.call(object, key) && key != 'constructor') {
        result.push(key);
      }
    }
    return result;
  }

  var _baseKeys = baseKeys;

  /**
   * Checks if `value` is array-like. A value is considered array-like if it's
   * not a function and has a `value.length` that's an integer greater than or
   * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
   * @example
   *
   * _.isArrayLike([1, 2, 3]);
   * // => true
   *
   * _.isArrayLike(document.body.children);
   * // => true
   *
   * _.isArrayLike('abc');
   * // => true
   *
   * _.isArrayLike(_.noop);
   * // => false
   */
  function isArrayLike(value) {
    return value != null && isLength_1(value.length) && !isFunction_1(value);
  }

  var isArrayLike_1 = isArrayLike;

  /**
   * Creates an array of the own enumerable property names of `object`.
   *
   * **Note:** Non-object values are coerced to objects. See the
   * [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
   * for more details.
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category Object
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names.
   * @example
   *
   * function Foo() {
   *   this.a = 1;
   *   this.b = 2;
   * }
   *
   * Foo.prototype.c = 3;
   *
   * _.keys(new Foo);
   * // => ['a', 'b'] (iteration order is not guaranteed)
   *
   * _.keys('hi');
   * // => ['0', '1']
   */
  function keys(object) {
    return isArrayLike_1(object) ? _arrayLikeKeys(object) : _baseKeys(object);
  }

  var keys_1 = keys;

  /**
   * The base implementation of `_.assign` without support for multiple sources
   * or `customizer` functions.
   *
   * @private
   * @param {Object} object The destination object.
   * @param {Object} source The source object.
   * @returns {Object} Returns `object`.
   */
  function baseAssign(object, source) {
    return object && _copyObject(source, keys_1(source), object);
  }

  var _baseAssign = baseAssign;

  /**
   * This function is like
   * [`Object.keys`](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
   * except that it includes inherited enumerable properties.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names.
   */
  function nativeKeysIn(object) {
    var result = [];
    if (object != null) {
      for (var key in Object(object)) {
        result.push(key);
      }
    }
    return result;
  }

  var _nativeKeysIn = nativeKeysIn;

  /** Used for built-in method references. */
  var objectProto$a = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$8 = objectProto$a.hasOwnProperty;

  /**
   * The base implementation of `_.keysIn` which doesn't treat sparse arrays as dense.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names.
   */
  function baseKeysIn(object) {
    if (!isObject_1(object)) {
      return _nativeKeysIn(object);
    }
    var isProto = _isPrototype(object),
        result = [];

    for (var key in object) {
      if (!(key == 'constructor' && (isProto || !hasOwnProperty$8.call(object, key)))) {
        result.push(key);
      }
    }
    return result;
  }

  var _baseKeysIn = baseKeysIn;

  /**
   * Creates an array of the own and inherited enumerable property names of `object`.
   *
   * **Note:** Non-object values are coerced to objects.
   *
   * @static
   * @memberOf _
   * @since 3.0.0
   * @category Object
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names.
   * @example
   *
   * function Foo() {
   *   this.a = 1;
   *   this.b = 2;
   * }
   *
   * Foo.prototype.c = 3;
   *
   * _.keysIn(new Foo);
   * // => ['a', 'b', 'c'] (iteration order is not guaranteed)
   */
  function keysIn$1(object) {
    return isArrayLike_1(object) ? _arrayLikeKeys(object, true) : _baseKeysIn(object);
  }

  var keysIn_1 = keysIn$1;

  /**
   * The base implementation of `_.assignIn` without support for multiple sources
   * or `customizer` functions.
   *
   * @private
   * @param {Object} object The destination object.
   * @param {Object} source The source object.
   * @returns {Object} Returns `object`.
   */
  function baseAssignIn(object, source) {
    return object && _copyObject(source, keysIn_1(source), object);
  }

  var _baseAssignIn = baseAssignIn;

  var _cloneBuffer = createCommonjsModule(function (module, exports) {
  /** Detect free variable `exports`. */
  var freeExports =  exports && !exports.nodeType && exports;

  /** Detect free variable `module`. */
  var freeModule = freeExports && 'object' == 'object' && module && !module.nodeType && module;

  /** Detect the popular CommonJS extension `module.exports`. */
  var moduleExports = freeModule && freeModule.exports === freeExports;

  /** Built-in value references. */
  var Buffer = moduleExports ? _root.Buffer : undefined,
      allocUnsafe = Buffer ? Buffer.allocUnsafe : undefined;

  /**
   * Creates a clone of  `buffer`.
   *
   * @private
   * @param {Buffer} buffer The buffer to clone.
   * @param {boolean} [isDeep] Specify a deep clone.
   * @returns {Buffer} Returns the cloned buffer.
   */
  function cloneBuffer(buffer, isDeep) {
    if (isDeep) {
      return buffer.slice();
    }
    var length = buffer.length,
        result = allocUnsafe ? allocUnsafe(length) : new buffer.constructor(length);

    buffer.copy(result);
    return result;
  }

  module.exports = cloneBuffer;
  });

  /**
   * Copies the values of `source` to `array`.
   *
   * @private
   * @param {Array} source The array to copy values from.
   * @param {Array} [array=[]] The array to copy values to.
   * @returns {Array} Returns `array`.
   */
  function copyArray(source, array) {
    var index = -1,
        length = source.length;

    array || (array = Array(length));
    while (++index < length) {
      array[index] = source[index];
    }
    return array;
  }

  var _copyArray = copyArray;

  /**
   * A specialized version of `_.filter` for arrays without support for
   * iteratee shorthands.
   *
   * @private
   * @param {Array} [array] The array to iterate over.
   * @param {Function} predicate The function invoked per iteration.
   * @returns {Array} Returns the new filtered array.
   */
  function arrayFilter(array, predicate) {
    var index = -1,
        length = array == null ? 0 : array.length,
        resIndex = 0,
        result = [];

    while (++index < length) {
      var value = array[index];
      if (predicate(value, index, array)) {
        result[resIndex++] = value;
      }
    }
    return result;
  }

  var _arrayFilter = arrayFilter;

  /**
   * This method returns a new empty array.
   *
   * @static
   * @memberOf _
   * @since 4.13.0
   * @category Util
   * @returns {Array} Returns the new empty array.
   * @example
   *
   * var arrays = _.times(2, _.stubArray);
   *
   * console.log(arrays);
   * // => [[], []]
   *
   * console.log(arrays[0] === arrays[1]);
   * // => false
   */
  function stubArray() {
    return [];
  }

  var stubArray_1 = stubArray;

  /** Used for built-in method references. */
  var objectProto$b = Object.prototype;

  /** Built-in value references. */
  var propertyIsEnumerable$1 = objectProto$b.propertyIsEnumerable;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeGetSymbols = Object.getOwnPropertySymbols;

  /**
   * Creates an array of the own enumerable symbols of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of symbols.
   */
  var getSymbols = !nativeGetSymbols ? stubArray_1 : function(object) {
    if (object == null) {
      return [];
    }
    object = Object(object);
    return _arrayFilter(nativeGetSymbols(object), function(symbol) {
      return propertyIsEnumerable$1.call(object, symbol);
    });
  };

  var _getSymbols = getSymbols;

  /**
   * Copies own symbols of `source` to `object`.
   *
   * @private
   * @param {Object} source The object to copy symbols from.
   * @param {Object} [object={}] The object to copy symbols to.
   * @returns {Object} Returns `object`.
   */
  function copySymbols(source, object) {
    return _copyObject(source, _getSymbols(source), object);
  }

  var _copySymbols = copySymbols;

  /**
   * Appends the elements of `values` to `array`.
   *
   * @private
   * @param {Array} array The array to modify.
   * @param {Array} values The values to append.
   * @returns {Array} Returns `array`.
   */
  function arrayPush(array, values) {
    var index = -1,
        length = values.length,
        offset = array.length;

    while (++index < length) {
      array[offset + index] = values[index];
    }
    return array;
  }

  var _arrayPush = arrayPush;

  /** Built-in value references. */
  var getPrototype = _overArg(Object.getPrototypeOf, Object);

  var _getPrototype = getPrototype;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeGetSymbols$1 = Object.getOwnPropertySymbols;

  /**
   * Creates an array of the own and inherited enumerable symbols of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of symbols.
   */
  var getSymbolsIn = !nativeGetSymbols$1 ? stubArray_1 : function(object) {
    var result = [];
    while (object) {
      _arrayPush(result, _getSymbols(object));
      object = _getPrototype(object);
    }
    return result;
  };

  var _getSymbolsIn = getSymbolsIn;

  /**
   * Copies own and inherited symbols of `source` to `object`.
   *
   * @private
   * @param {Object} source The object to copy symbols from.
   * @param {Object} [object={}] The object to copy symbols to.
   * @returns {Object} Returns `object`.
   */
  function copySymbolsIn(source, object) {
    return _copyObject(source, _getSymbolsIn(source), object);
  }

  var _copySymbolsIn = copySymbolsIn;

  /**
   * The base implementation of `getAllKeys` and `getAllKeysIn` which uses
   * `keysFunc` and `symbolsFunc` to get the enumerable property names and
   * symbols of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @param {Function} keysFunc The function to get the keys of `object`.
   * @param {Function} symbolsFunc The function to get the symbols of `object`.
   * @returns {Array} Returns the array of property names and symbols.
   */
  function baseGetAllKeys(object, keysFunc, symbolsFunc) {
    var result = keysFunc(object);
    return isArray_1(object) ? result : _arrayPush(result, symbolsFunc(object));
  }

  var _baseGetAllKeys = baseGetAllKeys;

  /**
   * Creates an array of own enumerable property names and symbols of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names and symbols.
   */
  function getAllKeys(object) {
    return _baseGetAllKeys(object, keys_1, _getSymbols);
  }

  var _getAllKeys = getAllKeys;

  /**
   * Creates an array of own and inherited enumerable property names and
   * symbols of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names and symbols.
   */
  function getAllKeysIn(object) {
    return _baseGetAllKeys(object, keysIn_1, _getSymbolsIn);
  }

  var _getAllKeysIn = getAllKeysIn;

  /* Built-in method references that are verified to be native. */
  var DataView = _getNative(_root, 'DataView');

  var _DataView = DataView;

  /* Built-in method references that are verified to be native. */
  var Promise$1 = _getNative(_root, 'Promise');

  var _Promise = Promise$1;

  /* Built-in method references that are verified to be native. */
  var Set = _getNative(_root, 'Set');

  var _Set = Set;

  /* Built-in method references that are verified to be native. */
  var WeakMap = _getNative(_root, 'WeakMap');

  var _WeakMap = WeakMap;

  /** `Object#toString` result references. */
  var mapTag$1 = '[object Map]',
      objectTag$1 = '[object Object]',
      promiseTag = '[object Promise]',
      setTag$1 = '[object Set]',
      weakMapTag$1 = '[object WeakMap]';

  var dataViewTag$1 = '[object DataView]';

  /** Used to detect maps, sets, and weakmaps. */
  var dataViewCtorString = _toSource(_DataView),
      mapCtorString = _toSource(_Map),
      promiseCtorString = _toSource(_Promise),
      setCtorString = _toSource(_Set),
      weakMapCtorString = _toSource(_WeakMap);

  /**
   * Gets the `toStringTag` of `value`.
   *
   * @private
   * @param {*} value The value to query.
   * @returns {string} Returns the `toStringTag`.
   */
  var getTag = _baseGetTag;

  // Fallback for data views, maps, sets, and weak maps in IE 11 and promises in Node.js < 6.
  if ((_DataView && getTag(new _DataView(new ArrayBuffer(1))) != dataViewTag$1) ||
      (_Map && getTag(new _Map) != mapTag$1) ||
      (_Promise && getTag(_Promise.resolve()) != promiseTag) ||
      (_Set && getTag(new _Set) != setTag$1) ||
      (_WeakMap && getTag(new _WeakMap) != weakMapTag$1)) {
    getTag = function(value) {
      var result = _baseGetTag(value),
          Ctor = result == objectTag$1 ? value.constructor : undefined,
          ctorString = Ctor ? _toSource(Ctor) : '';

      if (ctorString) {
        switch (ctorString) {
          case dataViewCtorString: return dataViewTag$1;
          case mapCtorString: return mapTag$1;
          case promiseCtorString: return promiseTag;
          case setCtorString: return setTag$1;
          case weakMapCtorString: return weakMapTag$1;
        }
      }
      return result;
    };
  }

  var _getTag = getTag;

  /** Used for built-in method references. */
  var objectProto$c = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$9 = objectProto$c.hasOwnProperty;

  /**
   * Initializes an array clone.
   *
   * @private
   * @param {Array} array The array to clone.
   * @returns {Array} Returns the initialized clone.
   */
  function initCloneArray(array) {
    var length = array.length,
        result = new array.constructor(length);

    // Add properties assigned by `RegExp#exec`.
    if (length && typeof array[0] == 'string' && hasOwnProperty$9.call(array, 'index')) {
      result.index = array.index;
      result.input = array.input;
    }
    return result;
  }

  var _initCloneArray = initCloneArray;

  /** Built-in value references. */
  var Uint8Array = _root.Uint8Array;

  var _Uint8Array = Uint8Array;

  /**
   * Creates a clone of `arrayBuffer`.
   *
   * @private
   * @param {ArrayBuffer} arrayBuffer The array buffer to clone.
   * @returns {ArrayBuffer} Returns the cloned array buffer.
   */
  function cloneArrayBuffer(arrayBuffer) {
    var result = new arrayBuffer.constructor(arrayBuffer.byteLength);
    new _Uint8Array(result).set(new _Uint8Array(arrayBuffer));
    return result;
  }

  var _cloneArrayBuffer = cloneArrayBuffer;

  /**
   * Creates a clone of `dataView`.
   *
   * @private
   * @param {Object} dataView The data view to clone.
   * @param {boolean} [isDeep] Specify a deep clone.
   * @returns {Object} Returns the cloned data view.
   */
  function cloneDataView(dataView, isDeep) {
    var buffer = isDeep ? _cloneArrayBuffer(dataView.buffer) : dataView.buffer;
    return new dataView.constructor(buffer, dataView.byteOffset, dataView.byteLength);
  }

  var _cloneDataView = cloneDataView;

  /** Used to match `RegExp` flags from their coerced string values. */
  var reFlags = /\w*$/;

  /**
   * Creates a clone of `regexp`.
   *
   * @private
   * @param {Object} regexp The regexp to clone.
   * @returns {Object} Returns the cloned regexp.
   */
  function cloneRegExp(regexp) {
    var result = new regexp.constructor(regexp.source, reFlags.exec(regexp));
    result.lastIndex = regexp.lastIndex;
    return result;
  }

  var _cloneRegExp = cloneRegExp;

  /** Used to convert symbols to primitives and strings. */
  var symbolProto = _Symbol ? _Symbol.prototype : undefined,
      symbolValueOf = symbolProto ? symbolProto.valueOf : undefined;

  /**
   * Creates a clone of the `symbol` object.
   *
   * @private
   * @param {Object} symbol The symbol object to clone.
   * @returns {Object} Returns the cloned symbol object.
   */
  function cloneSymbol(symbol) {
    return symbolValueOf ? Object(symbolValueOf.call(symbol)) : {};
  }

  var _cloneSymbol = cloneSymbol;

  /**
   * Creates a clone of `typedArray`.
   *
   * @private
   * @param {Object} typedArray The typed array to clone.
   * @param {boolean} [isDeep] Specify a deep clone.
   * @returns {Object} Returns the cloned typed array.
   */
  function cloneTypedArray(typedArray, isDeep) {
    var buffer = isDeep ? _cloneArrayBuffer(typedArray.buffer) : typedArray.buffer;
    return new typedArray.constructor(buffer, typedArray.byteOffset, typedArray.length);
  }

  var _cloneTypedArray = cloneTypedArray;

  /** `Object#toString` result references. */
  var boolTag$1 = '[object Boolean]',
      dateTag$1 = '[object Date]',
      mapTag$2 = '[object Map]',
      numberTag$1 = '[object Number]',
      regexpTag$1 = '[object RegExp]',
      setTag$2 = '[object Set]',
      stringTag$1 = '[object String]',
      symbolTag = '[object Symbol]';

  var arrayBufferTag$1 = '[object ArrayBuffer]',
      dataViewTag$2 = '[object DataView]',
      float32Tag$1 = '[object Float32Array]',
      float64Tag$1 = '[object Float64Array]',
      int8Tag$1 = '[object Int8Array]',
      int16Tag$1 = '[object Int16Array]',
      int32Tag$1 = '[object Int32Array]',
      uint8Tag$1 = '[object Uint8Array]',
      uint8ClampedTag$1 = '[object Uint8ClampedArray]',
      uint16Tag$1 = '[object Uint16Array]',
      uint32Tag$1 = '[object Uint32Array]';

  /**
   * Initializes an object clone based on its `toStringTag`.
   *
   * **Note:** This function only supports cloning values with tags of
   * `Boolean`, `Date`, `Error`, `Map`, `Number`, `RegExp`, `Set`, or `String`.
   *
   * @private
   * @param {Object} object The object to clone.
   * @param {string} tag The `toStringTag` of the object to clone.
   * @param {boolean} [isDeep] Specify a deep clone.
   * @returns {Object} Returns the initialized clone.
   */
  function initCloneByTag(object, tag, isDeep) {
    var Ctor = object.constructor;
    switch (tag) {
      case arrayBufferTag$1:
        return _cloneArrayBuffer(object);

      case boolTag$1:
      case dateTag$1:
        return new Ctor(+object);

      case dataViewTag$2:
        return _cloneDataView(object, isDeep);

      case float32Tag$1: case float64Tag$1:
      case int8Tag$1: case int16Tag$1: case int32Tag$1:
      case uint8Tag$1: case uint8ClampedTag$1: case uint16Tag$1: case uint32Tag$1:
        return _cloneTypedArray(object, isDeep);

      case mapTag$2:
        return new Ctor;

      case numberTag$1:
      case stringTag$1:
        return new Ctor(object);

      case regexpTag$1:
        return _cloneRegExp(object);

      case setTag$2:
        return new Ctor;

      case symbolTag:
        return _cloneSymbol(object);
    }
  }

  var _initCloneByTag = initCloneByTag;

  /** Built-in value references. */
  var objectCreate = Object.create;

  /**
   * The base implementation of `_.create` without support for assigning
   * properties to the created object.
   *
   * @private
   * @param {Object} proto The object to inherit from.
   * @returns {Object} Returns the new object.
   */
  var baseCreate = (function() {
    function object() {}
    return function(proto) {
      if (!isObject_1(proto)) {
        return {};
      }
      if (objectCreate) {
        return objectCreate(proto);
      }
      object.prototype = proto;
      var result = new object;
      object.prototype = undefined;
      return result;
    };
  }());

  var _baseCreate = baseCreate;

  /**
   * Initializes an object clone.
   *
   * @private
   * @param {Object} object The object to clone.
   * @returns {Object} Returns the initialized clone.
   */
  function initCloneObject(object) {
    return (typeof object.constructor == 'function' && !_isPrototype(object))
      ? _baseCreate(_getPrototype(object))
      : {};
  }

  var _initCloneObject = initCloneObject;

  /** `Object#toString` result references. */
  var mapTag$3 = '[object Map]';

  /**
   * The base implementation of `_.isMap` without Node.js optimizations.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a map, else `false`.
   */
  function baseIsMap(value) {
    return isObjectLike_1(value) && _getTag(value) == mapTag$3;
  }

  var _baseIsMap = baseIsMap;

  /* Node.js helper references. */
  var nodeIsMap = _nodeUtil && _nodeUtil.isMap;

  /**
   * Checks if `value` is classified as a `Map` object.
   *
   * @static
   * @memberOf _
   * @since 4.3.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a map, else `false`.
   * @example
   *
   * _.isMap(new Map);
   * // => true
   *
   * _.isMap(new WeakMap);
   * // => false
   */
  var isMap = nodeIsMap ? _baseUnary(nodeIsMap) : _baseIsMap;

  var isMap_1 = isMap;

  /** `Object#toString` result references. */
  var setTag$3 = '[object Set]';

  /**
   * The base implementation of `_.isSet` without Node.js optimizations.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a set, else `false`.
   */
  function baseIsSet(value) {
    return isObjectLike_1(value) && _getTag(value) == setTag$3;
  }

  var _baseIsSet = baseIsSet;

  /* Node.js helper references. */
  var nodeIsSet = _nodeUtil && _nodeUtil.isSet;

  /**
   * Checks if `value` is classified as a `Set` object.
   *
   * @static
   * @memberOf _
   * @since 4.3.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a set, else `false`.
   * @example
   *
   * _.isSet(new Set);
   * // => true
   *
   * _.isSet(new WeakSet);
   * // => false
   */
  var isSet = nodeIsSet ? _baseUnary(nodeIsSet) : _baseIsSet;

  var isSet_1 = isSet;

  /** Used to compose bitmasks for cloning. */
  var CLONE_DEEP_FLAG = 1,
      CLONE_FLAT_FLAG = 2,
      CLONE_SYMBOLS_FLAG = 4;

  /** `Object#toString` result references. */
  var argsTag$2 = '[object Arguments]',
      arrayTag$1 = '[object Array]',
      boolTag$2 = '[object Boolean]',
      dateTag$2 = '[object Date]',
      errorTag$1 = '[object Error]',
      funcTag$2 = '[object Function]',
      genTag$1 = '[object GeneratorFunction]',
      mapTag$4 = '[object Map]',
      numberTag$2 = '[object Number]',
      objectTag$2 = '[object Object]',
      regexpTag$2 = '[object RegExp]',
      setTag$4 = '[object Set]',
      stringTag$2 = '[object String]',
      symbolTag$1 = '[object Symbol]',
      weakMapTag$2 = '[object WeakMap]';

  var arrayBufferTag$2 = '[object ArrayBuffer]',
      dataViewTag$3 = '[object DataView]',
      float32Tag$2 = '[object Float32Array]',
      float64Tag$2 = '[object Float64Array]',
      int8Tag$2 = '[object Int8Array]',
      int16Tag$2 = '[object Int16Array]',
      int32Tag$2 = '[object Int32Array]',
      uint8Tag$2 = '[object Uint8Array]',
      uint8ClampedTag$2 = '[object Uint8ClampedArray]',
      uint16Tag$2 = '[object Uint16Array]',
      uint32Tag$2 = '[object Uint32Array]';

  /** Used to identify `toStringTag` values supported by `_.clone`. */
  var cloneableTags = {};
  cloneableTags[argsTag$2] = cloneableTags[arrayTag$1] =
  cloneableTags[arrayBufferTag$2] = cloneableTags[dataViewTag$3] =
  cloneableTags[boolTag$2] = cloneableTags[dateTag$2] =
  cloneableTags[float32Tag$2] = cloneableTags[float64Tag$2] =
  cloneableTags[int8Tag$2] = cloneableTags[int16Tag$2] =
  cloneableTags[int32Tag$2] = cloneableTags[mapTag$4] =
  cloneableTags[numberTag$2] = cloneableTags[objectTag$2] =
  cloneableTags[regexpTag$2] = cloneableTags[setTag$4] =
  cloneableTags[stringTag$2] = cloneableTags[symbolTag$1] =
  cloneableTags[uint8Tag$2] = cloneableTags[uint8ClampedTag$2] =
  cloneableTags[uint16Tag$2] = cloneableTags[uint32Tag$2] = true;
  cloneableTags[errorTag$1] = cloneableTags[funcTag$2] =
  cloneableTags[weakMapTag$2] = false;

  /**
   * The base implementation of `_.clone` and `_.cloneDeep` which tracks
   * traversed objects.
   *
   * @private
   * @param {*} value The value to clone.
   * @param {boolean} bitmask The bitmask flags.
   *  1 - Deep clone
   *  2 - Flatten inherited properties
   *  4 - Clone symbols
   * @param {Function} [customizer] The function to customize cloning.
   * @param {string} [key] The key of `value`.
   * @param {Object} [object] The parent object of `value`.
   * @param {Object} [stack] Tracks traversed objects and their clone counterparts.
   * @returns {*} Returns the cloned value.
   */
  function baseClone(value, bitmask, customizer, key, object, stack) {
    var result,
        isDeep = bitmask & CLONE_DEEP_FLAG,
        isFlat = bitmask & CLONE_FLAT_FLAG,
        isFull = bitmask & CLONE_SYMBOLS_FLAG;

    if (customizer) {
      result = object ? customizer(value, key, object, stack) : customizer(value);
    }
    if (result !== undefined) {
      return result;
    }
    if (!isObject_1(value)) {
      return value;
    }
    var isArr = isArray_1(value);
    if (isArr) {
      result = _initCloneArray(value);
      if (!isDeep) {
        return _copyArray(value, result);
      }
    } else {
      var tag = _getTag(value),
          isFunc = tag == funcTag$2 || tag == genTag$1;

      if (isBuffer_1(value)) {
        return _cloneBuffer(value, isDeep);
      }
      if (tag == objectTag$2 || tag == argsTag$2 || (isFunc && !object)) {
        result = (isFlat || isFunc) ? {} : _initCloneObject(value);
        if (!isDeep) {
          return isFlat
            ? _copySymbolsIn(value, _baseAssignIn(result, value))
            : _copySymbols(value, _baseAssign(result, value));
        }
      } else {
        if (!cloneableTags[tag]) {
          return object ? value : {};
        }
        result = _initCloneByTag(value, tag, isDeep);
      }
    }
    // Check for circular references and return its corresponding clone.
    stack || (stack = new _Stack);
    var stacked = stack.get(value);
    if (stacked) {
      return stacked;
    }
    stack.set(value, result);

    if (isSet_1(value)) {
      value.forEach(function(subValue) {
        result.add(baseClone(subValue, bitmask, customizer, subValue, value, stack));
      });
    } else if (isMap_1(value)) {
      value.forEach(function(subValue, key) {
        result.set(key, baseClone(subValue, bitmask, customizer, key, value, stack));
      });
    }

    var keysFunc = isFull
      ? (isFlat ? _getAllKeysIn : _getAllKeys)
      : (isFlat ? keysIn : keys_1);

    var props = isArr ? undefined : keysFunc(value);
    _arrayEach(props || value, function(subValue, key) {
      if (props) {
        key = subValue;
        subValue = value[key];
      }
      // Recursively populate clone (susceptible to call stack limits).
      _assignValue(result, key, baseClone(subValue, bitmask, customizer, key, value, stack));
    });
    return result;
  }

  var _baseClone = baseClone;

  /** Used to compose bitmasks for cloning. */
  var CLONE_DEEP_FLAG$1 = 1,
      CLONE_SYMBOLS_FLAG$1 = 4;

  /**
   * This method is like `_.clone` except that it recursively clones `value`.
   *
   * @static
   * @memberOf _
   * @since 1.0.0
   * @category Lang
   * @param {*} value The value to recursively clone.
   * @returns {*} Returns the deep cloned value.
   * @see _.clone
   * @example
   *
   * var objects = [{ 'a': 1 }, { 'b': 2 }];
   *
   * var deep = _.cloneDeep(objects);
   * console.log(deep[0] === objects[0]);
   * // => false
   */
  function cloneDeep(value) {
    return _baseClone(value, CLONE_DEEP_FLAG$1 | CLONE_SYMBOLS_FLAG$1);
  }

  var cloneDeep_1 = cloneDeep;

  function pack(component, ids = {}) {
    const target = cloneDeep_1(component);

    if (target.children) {
      Object.entries(target.children).forEach(([ name, sub ]) => {
        
        if (Array.isArray(sub)) {
          sub.forEach((s, i) => {
            ids = pack(s, ids);
            target.children[name][i] = s.id;
          });
        } else {
          ids = pack(sub, ids);
          target.children[name] = sub.id;
        }
      });
    }

    ids[target.id] = target;
    return ids;
  }

  function unpack(by_id, id) {
    const component = cloneDeep_1(by_id[id]);

    if (component.children) {
      const children = component.children;
      const unpacked_children = {};

      Object.entries(children).forEach(([ name, sub ]) => {
        if (Array.isArray(sub)) {
          unpacked_children[name] = [];

          sub.forEach(s => {
            unpacked_children[name].push(unpack(by_id, s));
          });
        } else {
          unpacked_children[name] = unpack(by_id, sub);
        }
      });

      component.children = unpacked_children;
    }

    return component;
  }

  function index_by_id(layout) {
    return layout.reduce((ids, comp) => pack(comp, ids), {})
  }

  function index_by_name(by_id) {
    return Object.values(by_id)
      .reduce((all, comp) => {
        if (comp.name) {
          all[comp.name] = comp.id;
        }
        return all;
      }, {});
  }

  let translate_y_fns = {
    "stream": stream_translate_y,
    "persistent_query": persistent_query_translate_y
  };

  function stream_translate_y(data, height) {
    data.refs.top_y += height;
    data.refs.bottom_y += height;

    const label = data.children.label;

    label.rendering.text.y += height;

    label.rendering.tip.y1 += height;
    label.rendering.tip.y2 += height;

    label.rendering.bar.y1 += height;
    label.rendering.bar.y2 += height;

    label.rendering.left_foot.y1 += height;
    label.rendering.left_foot.y2 += height;

    label.rendering.right_foot.y1 += height;
    label.rendering.right_foot.y2 += height;

    data.children.partitions = data.children.partitions.map(partition => {
      partition.rendering.partition_label.y += height;
      partition.rendering.container.y += height;

      partition.refs.midpoint_y += height;

      partition.children.rows = partition.children.rows.map(row => {
        row.rendering.y += height;
        return row;
      });

      partition.children.consumer_markers = partition.children.consumer_markers.map(marker => {
        marker.rendering.arrow_y += height;
        marker.rendering.text_y += height;
        marker.refs.top_y += height;

        return marker;
      });

      return partition;
    });
    
    return data;
  }

  function persistent_query_translate_y(data, height) {
    data.rendering.line.y2 += height;

    data.rendering.container.y += height;
    data.rendering.label.y += height;

    data.refs.midpoint_y += height;
    data.refs.bottom_y += height;
    data.refs.box_bottom_y += height;

    data.children.source_partitions.rendering.container.y += height;

    data.children.source_partitions.children.partitions.forEach(partition => {
      partition.rendering.y += height;
      partition.refs.bottom_y += height;
    });

    data.children.stream_time.rendering.y += height;
    data.children.stream_time.refs.bottom_y += height;

    if (data.children.materialized_view) {
      data.children.materialized_view.rendering.container.y += height;
      data.children.materialized_view.refs.bottom_y += height;
    }
    
    return data;
  }

  function vertically_center_layout(layout_data) {
    const heights = layout_data.map(components => {
      if (components.length == 1) {
        let data = components[0];

        return data.refs.bottom_y - data.refs.top_y;
      } else {
        let data_1 = components[0];
        let data_2 = components.slice(-1)[0];

        return data_2.refs.bottom_y - data_1.refs.top_y;
      }
    });

    const max_height = Math.max(...heights);

    return heights.map((height, i) => {
      const diff = (max_height - height) / 2;
      const n = layout_data[i].length;
      const each_diff = diff / n;

      return layout_data[i].map(data => {
        const fn = translate_y_fns[data.kind];
        return fn(data, each_diff);
      });
    });
  }

  const styles = {
    svg_width: 1200,
    svg_height: 500,

    dynamic_target: "dynamic-elements",

    pq_width: 75,
    pq_height: 75,
    pq_margin_top: 50,
    pq_container_fill: "#d7eff6",
    pq_container_opacity: 0.5,
    pq_label_margin_left: 0,
    pq_label_margin_bottom: 10,
    pq_metadata_offset_top: 10,
    pq_metadata_margin_top: 15,

    source_partitions_margin_left: 10,
    source_partitions_fill: "#f5f5f5",

    st_margin_top: 20,
    st_margin_left: 5,

    coll_padding_top: 10,
    coll_margin_bottom: 10,
    coll_tip_len: 10,
    coll_foot_len: 10,
    coll_tip_margin_top: 5,
    coll_label_margin_bottom: 20,

    part_width: 100,
    part_height: 45,
    part_margin_bottom: 30,
    part_container_fill: "#f5f5f5",
    part_id_margin_left: -15,
    part_id_margin_top: 15,

    row_width: 10,
    row_height: 10,
    row_margin_left: 5,
    row_offset_right: 10,
    row_default_fill: "#173361",

    d_row_margin_left: 10,
    d_row_enter_offset: 30,
    d_row_appear_ms: 250,

    consumer_m_text_margin_bottom: 15,
    consumer_m_offset_bottom: 5,
    consumer_m_margin_bottom: 15,
    consumer_m_margin_right: 3,

    mv_container_fill: "#fbf7e6",
    mv_margin_top: 10,
    mv_row_height: 15,

    render_controls: true,
    render_stream_time: false,

    font_size: "1em",
    seek_ms: 25,
    ms_px: 2
  };

  Object.defineProperty(String.prototype, 'hashCode', {
    value: function() {
      var hash = 0, i, chr;
      for (i = 0; i < this.length; i++) {
        chr   = this.charCodeAt(i);
        hash  = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
      }
      return hash;
    }
  });

  function choose_lowest_timestamp(streams, offsets) {
    let choices = [];

    streams.forEach(s => {
      const { id, name, children } = s;
      const { partitions } = children;

      partitions.forEach((partition, i) => {
        const offset = offsets[name][i];
        const row = partition.children.rows[offset];

        if (row != undefined) {
          choices.push(row);
        }
      });
    });

    return choices.reduce((result, row) => {
      if (result == undefined) {
        return row;
      } else if (row.vars.record.t < result.vars.record.t) {
        return row;
      } else {
        return result;
      }
    }, undefined);
  }

  function is_drained(offsets, by_name) {
    return Object.entries(offsets).every(([pq, streams]) => {
      return Object.entries(streams).every(([stream, partitions]) => {
        return Object.entries(partitions).every(([partition, offset]) => {
          const stream_data = by_name(stream);
          const partitions = stream_data.children.partitions;
          const rows = partitions[partition].children.rows;

          return offset == rows.length;
        });
      });
    });
  }

  function swap_partitions(by_name, pack, pq, offsets, before_row, after_row) {
    const after_stream_name = after_row.vars.record.stream;
    const after_partition = after_row.vars.record.partition;

    const after_stream_data = by_name(after_stream_name);
    const after_partition_data = after_stream_data.children.partitions[after_partition];

    after_row.vars.record.offset = after_partition_data.children.rows.length;
    after_partition_data.children.rows.push(after_row);

    const before_offset = offsets[pq][before_row.vars.record.stream][before_row.vars.record.partition];
    offsets[pq][before_row.vars.record.stream][before_row.vars.record.partition] = before_offset + 1;

    pack(after_partition_data);
  }

  function initialize_offsets(pqs, streams, by_name) {
    return pqs.reduce((all_pqs, pq) => {
      const parents = pq.graph.predecessors;

      const stream_offsets = parents.reduce((all_streams, parent) => {
        const parent_data = by_name(parent);
        const partitions = parent_data.children.partitions;

        const partition_offsets = [...Array(partitions.length).keys()]
              .reduce((all, i) => {
                all[i] = 0;
                return all;
              }, {});

        all_streams[parent] = partition_offsets;
        return all_streams;
      }, {});

      all_pqs[pq.name] = stream_offsets;
      return all_pqs;
    }, {});
  }

  function set_after_stream(after_row, into) {
    after_row.vars.record.stream = into;
  }

  function make_partitioner(key) {
    if (typeof key === 'string' || key instanceof String) {
      return key.hashCode();
    } else {
      return key;
    }
  }

  function repartition(context, before_row, after_row, partition_by) {
    if (partition_by) {
      const key = partition_by(context, before_row.vars.record, after_row.vars.record);
      after_row.vars.record.key = key;

      const partitioner = make_partitioner(key);
      after_row.vars.record.partition = partitioner % context.partitions;
    }
  }

  function initialize_stream_time(pqs) {
    return pqs.reduce((all, pq) => {
      all[pq] = undefined;
      return all;
    }, {});
  }

  function initialize_state(pqs) {
    return pqs.reduce((all, pq) => {
      const { name, vars } = pq;
      const { aggregate } = vars.query_parts;

      if (aggregate && ("init" in aggregate)) {
        all[name] = aggregate.init();
      } else {
        all[name] = undefined;
      }
      return all;
    }, {});
  }

  function update_stream_time(stream_time, pq, t) {
    const st = stream_time[pq];

    if ((st == undefined) || (t > st)) {
      stream_time[pq] = t;
    }
  }

  function evaluate_select(runtime_context, query_context, query_parts, before_row) {
    const { by_name, pack, pq, offsets, stream_time, lineage } = runtime_context;
    const { select, into, partition_by } = query_parts;

    const before_offsets = cloneDeep_1(offsets[pq]);
    const before_stream_time = stream_time[pq];
    const before_row_clone = cloneDeep_1(before_row);

    const after_row = { ...before_row_clone, ...{ id: uuidv4() } };

    after_row.vars.record = select(query_context, before_row_clone.vars.record);
    after_row.vars.derived_id = before_row.id;

    set_after_stream(after_row, into);
    repartition(query_context, before_row, after_row, partition_by);

    swap_partitions(by_name, pack, pq, offsets, before_row, after_row);
    update_stream_time(stream_time, pq, before_row.vars.record.t);

    if (before_row.vars.derived_id) {
      lineage[before_row.id] = before_row.vars.derived_id;
    } else {
      before_row.vars.derived_id = before_row.vars.source_id;
    }

    return {
      kind: "keep",
      before: {
        row: before_row,
        offsets: before_offsets,
        stream_time: before_stream_time
      },
      after: {
        row: after_row,
        offsets: cloneDeep_1(offsets[pq]),
        stream_time: stream_time[pq]
      },
      processed_by: pq
    };
  }

  function halt_record(runtime_context, query_context, before_row, kind) {
    const { offsets, stream_time, pq, pack, lineage } = runtime_context;

    const before_record = before_row.vars.record;
    const before_offsets = cloneDeep_1(offsets[pq]);
    const before_stream_time = stream_time[pq];

    offsets[pq][before_record.stream][before_record.partition]++;
    update_stream_time(stream_time, pq, before_row.vars.record.t);

    const after_row = { ...cloneDeep_1(before_row), ...{ id: uuidv4() } };
    after_row.vars.derived_id = before_row.id;
    pack(after_row);

    if (before_row.vars.derived_id) {
      lineage[before_row.id] = before_row.vars.derived_id;
    } else {
      before_row.vars.derived_id = before_row.vars.source_id;
    }

    return {
      kind: kind,
      before: {
        row: before_row,
        offsets: before_offsets,
        stream_time: before_stream_time
      },
      after: {
        row: after_row,
        offsets: cloneDeep_1(offsets[pq]),
        stream_time: stream_time[pq]
      },
      processed_by: pq
    }
  }

  function execute_filter(runtime_context, query_context, before_row) {
    return halt_record(runtime_context, query_context, before_row, "discard");
  }

  function execute_absorb(runtime_context, query_context, before_row) {
    return halt_record(runtime_context, query_context, before_row, "absorb");
  }

  function execute_aggregation(query_context, query_parts, state, pq, before_row) {
    if (query_parts.aggregate) {
      const delta = query_parts.aggregate.delta(state[pq], before_row.vars.record);
      state[pq] = { ...state[pq], ...delta };
      query_context.delta = delta;
    }
  }

  function init_runtime(objs, data_fns) {
    const streams = objs.filter(component => component.kind == "stream");
    const pqs = objs.filter(component => component.kind == "persistent_query");
    const pq_seq = pqs.map(pq => pq.name);

    const { by_name } = data_fns;

    return {
      streams: streams,
      pqs: pqs,
      pq_seq: pq_seq,
      offsets: initialize_offsets(pqs, streams, by_name),
      stream_time: initialize_stream_time(pq_seq),
      state: initialize_state(pqs),
      lineage: {},
      data_fns: data_fns
    };
  }

  function tick(rt_context) {
    const { streams, pqs, offsets, stream_time, state, lineage, data_fns } = rt_context;
    const { by_name, pack } = data_fns;

    const drained = is_drained(offsets, by_name);
    let pq_seq = rt_context.pq_seq;
    let action = undefined;

    if (!drained) {
      const pq = pq_seq[0];
      const pq_data = by_name(pq);
      const parent_stream_names = pq_data.graph.predecessors;
      const parent_streams = parent_stream_names.map(s => by_name(s));

      const before_row = choose_lowest_timestamp(parent_streams, offsets[pq]);

      const runtime_context = {
        by_name,
        pack,
        pq,
        offsets,
        stream_time,
        lineage
      };

      if (before_row) {
        const query_parts = pq_data.vars.query_parts;

        if (!query_parts.into) {
          execute_aggregation({}, query_parts, state, pq, before_row);
          action = execute_absorb(runtime_context, {}, before_row);
        } else {
          const sink_data = by_name(query_parts.into);
          const sink_partitions = sink_data.children.partitions;
          
          const query_context = {
            partitions: sink_partitions.length,
          };

          if (query_parts.where) {
            if (query_parts.where(query_context, before_row.vars.record)) {
              execute_aggregation(query_context, query_parts, state, pq, before_row);
              action = evaluate_select(runtime_context, query_context, query_parts, before_row);
            } else {
              action = execute_filter(runtime_context, query_context, before_row);
            }
          } else {
            execute_aggregation(query_context, query_parts, state, pq, before_row);
            action = evaluate_select(runtime_context, query_context, query_parts, before_row);
          }
        }
      }

      pq_seq = cycle_array(pq_seq);

      return {
        ...rt_context,
        ...{
          drained: false,
          pq_seq: pq_seq,
          action: action
        }
      };
    } else {
      return {
        ...rt_context,
        ...{
          drained: true,
          action: action
        }
      };
    }
  }

  function toggle_row_card_visibility(data_fns, card_id, viewable) {
    const { by_id, pack } = data_fns;

    const card_data = by_id(card_id);
    card_data.vars.viewable = viewable;
    toggle_visibility(card_data);

    pack(card_data);
  }

  function update_stream_time_text(data_fns, pq_name, row) {
    const { by_name } = data_fns;
    const pq_data = by_name(pq_name);
    const stream_time_data = pq_data.children.stream_time;

    update_time(stream_time_data, row);
  }

  function update_pq_offsets(data_fns, pq_name, offsets) {
    const { by_name } = data_fns;
    const pq_data = by_name(pq_name);

    Object.entries(offsets).forEach(([ collection, partitions] ) => {
      Object.entries(partitions).forEach(([ partition, offset ]) => {
        const sp_data = pq_data.children.source_partitions.children.partitions[partition];
        const last_offset = offset - 1;

        update_offset(sp_data, last_offset);
      });
    });
  }

  function update_row_card(data_fns, card_id, row) {
    const { by_id } = data_fns;

    const card_data = by_id(card_id);
    const record = row.vars.record;

    update_card_text(card_data, record);
  }

  function adjust_rendering(action, data_fns, styles) {
    const { by_id, by_name, pack } = data_fns;
    const { d_row_margin_left } = styles;
    const { stream, partition } = action.before.row.vars.record;

    const stream_data = by_name(stream);
    const partition_data = stream_data.children.partitions[partition];

    const right_x = partition_data.refs.right_x + d_row_margin_left;
    const row_data = by_id(action.after.row.id);

    row_data.rendering.x = right_x;

    // New card for new row.
    const card_config = {
      row_id: row_data.id,
      record: action.before.row.vars.record,
      viewable: false
    };

    row_data.children.row_card = build_data(card_config);

    pack(row_data);
  }

  function draw_new_row(action, data_fns) {
    const { by_id } = data_fns;
    const row_data = by_id(action.after.row.id);

    return render$1(row_data);
  }

  function update_layout(action, data_fns, styles, free_el) {
    adjust_rendering(action, data_fns, styles);

    const row = draw_new_row(action, data_fns);
    free_el.appendChild(row);
  }

  function animation_seq(action, data_fns, styles) {
    const { before, after, processed_by } = action;
    const { by_id, by_name, pack } = data_fns;
    const { row_width, row_height, row_offset_right, row_margin_left } = styles;
    const { d_row_enter_offset } = styles;
    const { consumer_m_margin_right } = styles;

    const before_record = before.row.vars.record;
    const before_stream_data = by_name(before_record.stream);
    const before_part_data = before_stream_data.children.partitions[before_record.partition];

    const after_record = after.row.vars.record;
    const after_stream_data = by_name(after_record.stream);
    const after_part_data = after_stream_data.children.partitions[after_record.partition];

    const pq_data = by_name(processed_by);
    const pq_enter_x = pq_data.refs.left_x;
    const pq_enter_y = pq_data.refs.midpoint_y;
    const pq_exit_x = pq_data.refs.right_x;

    const after_part_right_x = after_part_data.refs.right_x;
    const after_part_left_x = after_part_data.refs.left_x;

    const appear_x = after.row.rendering.x;
    const appear_y = after.row.rendering.y;

    const move_to_pq_center_x = pq_enter_x - d_row_enter_offset;
    const move_to_pq_center_y = pq_enter_y;

    const approach_pq_x = pq_enter_x;
    const traverse_pq_x = pq_exit_x;
    const depart_pq_x = traverse_pq_x + d_row_enter_offset;

    const move_to_partition_center_x = after_part_left_x - d_row_enter_offset;
    const move_to_partition_center_y = after_part_data.refs.midpoint_y - (row_height / 2);

    const after_part_margin = after_record.offset * row_margin_left;
    const after_part_spacing = after_record.offset * row_width;
    const enter_partition_x = after_part_right_x - after_part_margin - row_offset_right - after_part_spacing - row_width;

    after.row.rendering.x = enter_partition_x;
    after.row.rendering.y = move_to_partition_center_y;

    const before_fill = action.before.row.rendering.fill;
    let after_fill = undefined;

    if(pq_data.rendering.style.fill) {
      after_fill = pq_data.rendering.style.fill(before_record, after_record);
      after.row.rendering.fill = after_fill;
    }

    const fill_change = [before_fill, after_fill || before_fill];

    pack(after.row);
    after.row = by_id(after.row.id);

    const consumer_marker_id = before_part_data.vars.indexed_consumer_markers[processed_by];
    const consumer_marker_data = by_id(consumer_marker_id);
    const derived_row_data = by_id(after.row.vars.derived_id);

    const consumer_marker_before_x = consumer_marker_data.rendering.left_x;
    const consumer_marker_after_x = derived_row_data.rendering.x + (row_width / 2) - consumer_m_margin_right;

    // If the offset is 0, it's a reasonable proxy that this is the first
    // record in the partition, so it's time to unveil the consumer marker.
    let consumer_marker_opacity = undefined;
    if (before_record.offset == 0) {
      consumer_marker_opacity = [0, 1];
    }

    consumer_marker_data.rendering.left_x = consumer_marker_after_x;
    pack(consumer_marker_data);

    return {
      kind: "keep",
      action: action,
      animations: {
        appear: {
        },
        move_to_pq_center: {
          translateX: (move_to_pq_center_x - appear_x),
          translateY: (move_to_pq_center_y - appear_y)
        },
        approach_pq: {
          translateX: (approach_pq_x - move_to_pq_center_x)
        },
        traverse_pq: {
          translateX: (traverse_pq_x - approach_pq_x),
          fill: fill_change
        },
        depart_pq: {
          translateX: (depart_pq_x - traverse_pq_x)
        },
        move_to_partition_center: {
          translateX: (move_to_partition_center_x - depart_pq_x),
          translateY: (move_to_partition_center_y - move_to_pq_center_y)
        },
        enter_partition: {
          translateX: (enter_partition_x - move_to_partition_center_x)
        },
        move_consumer_marker: {
          translateX: (consumer_marker_before_x - consumer_marker_after_x),
          opacity: consumer_marker_opacity
        }
      }
    };
  }

  function anime_data(ctx, action_animation_seq, data_fns, lineage, styles) {
    const { t, history } = ctx;
    const { action, animations } = action_animation_seq;
    const { by_name, by_id, pack } = data_fns;
    const { ms_px, d_row_appear_ms } = styles;

    const pq_t = (t[action.processed_by] || 0);
    const row_history = (history[lineage[action.before.row.id]] || 0);
    const t_offset = ((row_history >= pq_t) ? row_history : pq_t);

    const appear_ms = d_row_appear_ms;
    const move_to_pq_center_ms = ms_for_translate(animations.move_to_pq_center, ms_px);
    const approach_pq_ms = ms_for_translate(animations.approach_pq, ms_px);
    const traverse_pq_ms = ms_for_translate(animations.traverse_pq, ms_px);
    const depart_pq_ms = ms_for_translate(animations.depart_pq, ms_px);
    const move_to_partition_center_ms = ms_for_translate(animations.move_to_partition_center, ms_px);
    const enter_partition_ms = ms_for_translate(animations.enter_partition, ms_px);

    const consumer_marker_ms = ms_for_translate(animations.move_consumer_marker, ms_px);

    const row_movement = {
      t: t_offset,
      params: {
        targets: `#${action.after.row.id}`,
        easing: "linear",
        keyframes: [
          {
            duration: appear_ms,
            opacity: [0, 1]
          },
          {
            duration: move_to_pq_center_ms,
            translateX: relative_add(animations.move_to_pq_center.translateX),
            translateY: relative_add(animations.move_to_pq_center.translateY)
          },
          {
            duration: approach_pq_ms,
            translateX: relative_add(animations.approach_pq.translateX)
          },
          {
            duration: traverse_pq_ms,
            translateX: relative_add(animations.traverse_pq.translateX),
            fill: animations.traverse_pq.fill,
          },
          {
            duration: depart_pq_ms,
            translateX: relative_add(animations.depart_pq.translateX)
          },
          {
            duration: move_to_partition_center_ms,
            translateX: relative_add(animations.move_to_partition_center.translateX),
            translateY: relative_add(animations.move_to_partition_center.translateY)
          },
          {
            duration: enter_partition_ms,
            translateX: relative_add(animations.enter_partition.translateX)
          }
        ]
      }
    };

    t[action.processed_by] = (t_offset + appear_ms + move_to_pq_center_ms + approach_pq_ms);
    history[action.before.row.id] = (
      t_offset +
        appear_ms +
        move_to_pq_center_ms +
        approach_pq_ms +
        traverse_pq_ms +
        depart_pq_ms +
        move_to_partition_center_ms +
        enter_partition_ms
    );

    const before_record = action.before.row.vars.record;
    const before_stream_data = by_name(before_record.stream);
    const before_part_data = before_stream_data.children.partitions[before_record.partition];
    const consumer_marker_id = before_part_data.vars.indexed_consumer_markers[action.processed_by];

    const consumer_marker_movement = {
      t: (t_offset + appear_ms + move_to_pq_center_ms + approach_pq_ms),
      params: {
        targets: `#${consumer_marker_id}`,
        easing: "linear",
        keyframes: [
          {
            duration: 1,
            opacity: animations.move_consumer_marker.opacity
          },
          {
            duration: consumer_marker_ms,
            translateX: relative_sub(animations.move_consumer_marker.translateX)
          }
        ]
      }
    };

    const card_id = action.after.row.children.row_card.id;

    const unhide_row_card = {
      t: t_offset,
      apply: function() {
        toggle_row_card_visibility(data_fns, card_id, true);
      },
      undo: function() {
        toggle_row_card_visibility(data_fns, card_id, false);
      }
    };

    const update_stream_time = {
      t: (t_offset + appear_ms + move_to_pq_center_ms + approach_pq_ms),
      apply: function() {
        update_stream_time_text(data_fns, action.processed_by, action.after);
      },
      undo: function() {
        update_stream_time_text(data_fns, action.processed_by, action.before);
      }
    };

    const update_pq_offsets$1 = {
      t: (t_offset + appear_ms + move_to_pq_center_ms + approach_pq_ms),
      apply: function() {
        update_pq_offsets(data_fns, action.processed_by, action.after.offsets);
      },
      undo: function() {
        update_pq_offsets(data_fns, action.processed_by, action.before.offsets);
      }
    };
    
    const update_row_card$1 = {
      t: (t_offset + appear_ms + move_to_pq_center_ms + approach_pq_ms),
      apply: function() {
        update_row_card(data_fns, card_id, action.after.row);
      },
      undo: function() {
        update_row_card(data_fns, card_id, action.before.row);
      }
    };

    const commands = [
      row_movement,
      consumer_marker_movement
    ];

    const callbacks = [
      unhide_row_card,
      update_stream_time,
      update_pq_offsets$1,
      update_row_card$1,
    ];

    const pq_data = by_name(action.processed_by);

    if (pq_data.vars.stateful) {
      const mv_id = pq_data.children.materialized_view.id;
      const key = action.after.row.vars.record.key;

      // Need to capture the previous value in the apply
      // callback to get the right undo value.
      let previous_row = undefined;

      const update_materialized_view = {
        t: (t_offset + appear_ms + move_to_pq_center_ms + approach_pq_ms),
        apply: function() {
          const mv_data = by_id(mv_id);
          previous_row = cloneDeep_1(mv_data.vars.row_index[key]);

          // Need to unpack this in the callback since it may have changed.
          update_table(mv_data, action.after.row);
          pack(mv_data);
        },
        undo: function() {
          // Same here, unpack since it may have changed.
          const mv_data = by_id(mv_id);
          undo_row(mv_data, key, previous_row);
          pack(mv_data);
        }
      };

      callbacks.push(update_materialized_view);
    }

    return {
      commands,
      callbacks
    };
  }

  function animation_seq$1(action, data_fns, styles) {
    const { before, after, processed_by } = action;
    const { by_id, by_name, pack } = data_fns;
    const { row_width, row_height, row_offset_right, row_margin_left } = styles;
    const { d_row_enter_offset } = styles;
    const { consumer_m_margin_right } = styles;

    const before_record = before.row.vars.record;
    const before_stream_data = by_name(before_record.stream);
    const before_part_data = before_stream_data.children.partitions[before_record.partition];

    const after_record = after.row.vars.record;
    const after_stream_data = by_name(after_record.stream);
    const after_part_data = after_stream_data.children.partitions[after_record.partition];

    const pq_data = by_name(processed_by);
    const pq_enter_x = pq_data.refs.left_x;
    const pq_enter_y = pq_data.refs.midpoint_y;
    const pq_exit_x = pq_data.refs.right_x;

    const after_part_right_x = after_part_data.refs.right_x;
    const after_part_left_x = after_part_data.refs.left_x;

    const appear_x = after.row.rendering.x;
    const appear_y = after.row.rendering.y;

    const move_to_pq_center_x = pq_enter_x - d_row_enter_offset;
    const move_to_pq_center_y = pq_enter_y;

    const approach_pq_x = pq_enter_x;
    const cross_half_pq_x = pq_data.refs.midpoint_x;
    const fall_away_y = pq_data.refs.box_bottom_y - row_height;

    after.row.rendering.x = cross_half_pq_x;
    after.row.rendering.y = fall_away_y;
    pack(after.row);

    const consumer_marker_id = before_part_data.vars.indexed_consumer_markers[processed_by];
    const consumer_marker_data = by_id(consumer_marker_id);
    const derived_row_data = by_id(after.row.vars.derived_id);

    const consumer_marker_before_x = consumer_marker_data.rendering.left_x;
    const consumer_marker_after_x = derived_row_data.rendering.x + (row_width / 2) - consumer_m_margin_right;

    // If the offset is 0, it's a reasonable proxy that this is the first
    // record in the partition, so it's time to unveil the consumer marker.
    let consumer_marker_opacity = undefined;
    if (before_record.offset == 0) {
      consumer_marker_opacity = [0, 1];
    }

    consumer_marker_data.rendering.left_x = consumer_marker_after_x;
    pack(consumer_marker_data);

    return {
      kind: "discard",
      action: action,
      animations: {
        appear: {
        },
        move_to_pq_center: {
          translateX: (move_to_pq_center_x - appear_x),
          translateY: (move_to_pq_center_y - appear_y)
        },
        approach_pq: {
          translateX: (approach_pq_x - move_to_pq_center_x)
        },
        cross_half_pq: {
          translateX: (cross_half_pq_x - approach_pq_x),
        },
        fall_away: {
          translateY: (fall_away_y - move_to_pq_center_y),
          opacity: [1, 0]
        },
        move_consumer_marker: {
          translateX: (consumer_marker_before_x - consumer_marker_after_x),
          opacity: consumer_marker_opacity
        }
      }
    };
  }

  function anime_data$1(ctx, action_animation_seq, data_fns, lineage, styles) {
    const { t, history } = ctx;
    const { action, animations } = action_animation_seq;
    const { by_name, by_id } = data_fns;
    const { ms_px, d_row_appear_ms } = styles;

    const pq_t = (t[action.processed_by] || 0);
    const row_history = (history[lineage[action.before.row.id]] || 0);
    const t_offset = ((row_history >= pq_t) ? row_history : pq_t);

    const appear_ms = d_row_appear_ms;
    const move_to_pq_center_ms = ms_for_translate(animations.move_to_pq_center, ms_px);
    const approach_pq_ms = ms_for_translate(animations.approach_pq, ms_px);
    const cross_half_pq_ms = ms_for_translate(animations.cross_half_pq, ms_px);
    const fall_away_ms = ms_for_translate(animations.fall_away, ms_px);

    const consumer_marker_ms = ms_for_translate(animations.move_consumer_marker, ms_px);

    const row_movement = {
      t: t_offset,
      params: {
        targets: `#${action.after.row.id}`,
        easing: "linear",
        keyframes: [
          {
            duration: appear_ms,
            opacity: [0, 1],
            fill: animations.appear.fill
          },
          {
            duration: move_to_pq_center_ms,
            translateX: relative_add(animations.move_to_pq_center.translateX),
            translateY: relative_add(animations.move_to_pq_center.translateY)
          },
          {
            duration: approach_pq_ms,
            translateX: relative_add(animations.approach_pq.translateX)
          },
          {
            duration: cross_half_pq_ms,
            translateX: relative_add(animations.cross_half_pq.translateX),
          },
          {
            duration: fall_away_ms,
            translateY: relative_add(animations.fall_away.translateY),
            opacity: animations.fall_away.opacity
          }
        ]
      }
    };

    t[action.processed_by] = (t_offset + appear_ms + move_to_pq_center_ms + approach_pq_ms);

    const before_record = action.before.row.vars.record;
    const before_stream_data = by_name(before_record.stream);
    const before_part_data = before_stream_data.children.partitions[before_record.partition];
    const consumer_marker_id = before_part_data.vars.indexed_consumer_markers[action.processed_by];

    const consumer_marker_movement = {
      t: (t_offset + appear_ms + move_to_pq_center_ms + approach_pq_ms),
      params: {
        targets: `#${consumer_marker_id}`,
        easing: "linear",
        keyframes: [
          {
            duration: 1,
            opacity: animations.move_consumer_marker.opacity
          },
          {
            duration: consumer_marker_ms,
            translateX: relative_sub(animations.move_consumer_marker.translateX)
          }
        ]
      }
    };

    const card_id = action.after.row.children.row_card.id;

    const unhide_row_card = {
      t: t_offset,
      apply: function() {
        toggle_row_card_visibility(data_fns, card_id, true);
      },
      undo: function() {
        toggle_row_card_visibility(data_fns, card_id, false);
      }
    };

    const update_stream_time = {
      t: (t_offset + appear_ms + move_to_pq_center_ms + approach_pq_ms),
      apply: function() {
        update_stream_time_text(data_fns, action.processed_by, action.after);
      },
      undo: function() {
        update_stream_time_text(data_fns, action.processed_by, action.before);
      }
    };

    const update_pq_offsets$1 = {
      t: (t_offset + appear_ms + move_to_pq_center_ms + approach_pq_ms),
      apply: function() {
        update_pq_offsets(data_fns, action.processed_by, action.after.offsets);
      },
      undo: function() {
        update_pq_offsets(data_fns, action.processed_by, action.before.offsets);
      }
    };

    return {
      commands: [
        row_movement,
        consumer_marker_movement
      ],
      callbacks: [
        unhide_row_card,
        update_stream_time,
        update_pq_offsets$1
      ]
    };
  }

  function animation_seq$2(action, data_fns, styles) {
    const { before, after, processed_by } = action;
    const { by_id, by_name, pack } = data_fns;
    const { row_width, row_height, row_offset_right, row_margin_left } = styles;
    const { d_row_enter_offset } = styles;
    const { consumer_m_margin_right } = styles;

    const before_record = before.row.vars.record;
    const before_stream_data = by_name(before_record.stream);
    const before_part_data = before_stream_data.children.partitions[before_record.partition];

    const after_record = after.row.vars.record;
    const after_stream_data = by_name(after_record.stream);
    const after_part_data = after_stream_data.children.partitions[after_record.partition];

    const pq_data = by_name(processed_by);
    const pq_enter_x = pq_data.refs.left_x;
    const pq_enter_y = pq_data.refs.midpoint_y;
    const pq_exit_x = pq_data.refs.right_x;

    const after_part_right_x = after_part_data.refs.right_x;
    const after_part_left_x = after_part_data.refs.left_x;

    const appear_x = after.row.rendering.x;
    const appear_y = after.row.rendering.y;

    const move_to_pq_center_x = pq_enter_x - d_row_enter_offset;
    const move_to_pq_center_y = pq_enter_y;

    const approach_pq_x = pq_enter_x;
    const cross_half_pq_x = pq_data.refs.midpoint_x;

    after.row.rendering.x = cross_half_pq_x;
    after.row.rendering.y = pq_enter_y;
    pack(after.row);

    const consumer_marker_id = before_part_data.vars.indexed_consumer_markers[processed_by];
    const consumer_marker_data = by_id(consumer_marker_id);
    const derived_row_data = by_id(after.row.vars.derived_id);

    const consumer_marker_before_x = consumer_marker_data.rendering.left_x;
    const consumer_marker_after_x = derived_row_data.rendering.x + (row_width / 2) - consumer_m_margin_right;

    // If the offset is 0, it's a reasonable proxy that this is the first
    // record in the partition, so it's time to unveil the consumer marker.
    let consumer_marker_opacity = undefined;
    if (before_record.offset == 0) {
      consumer_marker_opacity = [0, 1];
    }

    consumer_marker_data.rendering.left_x = consumer_marker_after_x;
    pack(consumer_marker_data);

    return {
      kind: "absorb",
      action: action,
      animations: {
        appear: {
        },
        move_to_pq_center: {
          translateX: (move_to_pq_center_x - appear_x),
          translateY: (move_to_pq_center_y - appear_y)
        },
        approach_pq: {
          translateX: (approach_pq_x - move_to_pq_center_x)
        },
        cross_half_pq: {
          translateX: (cross_half_pq_x - approach_pq_x),
          opacity: [1, 0]
        },
        move_consumer_marker: {
          translateX: (consumer_marker_before_x - consumer_marker_after_x),
          opacity: consumer_marker_opacity
        }
      }
    };
  }

  function anime_data$2(ctx, action_animation_seq, data_fns, lineage, styles) {
    const { t, history } = ctx;
    const { action, animations } = action_animation_seq;
    const { by_name, by_id, pack } = data_fns;
    const { ms_px, d_row_appear_ms } = styles;

    const pq_t = (t[action.processed_by] || 0);
    const row_history = (history[lineage[action.before.row.id]] || 0);
    const t_offset = ((row_history >= pq_t) ? row_history : pq_t);

    const appear_ms = d_row_appear_ms;
    const move_to_pq_center_ms = ms_for_translate(animations.move_to_pq_center, ms_px);
    const approach_pq_ms = ms_for_translate(animations.approach_pq, ms_px);
    const cross_half_pq_ms = ms_for_translate(animations.cross_half_pq, ms_px);

    const consumer_marker_ms = ms_for_translate(animations.move_consumer_marker, ms_px);

    const row_movement = {
      t: t_offset,
      params: {
        targets: `#${action.after.row.id}`,
        easing: "linear",
        keyframes: [
          {
            duration: appear_ms,
            opacity: [0, 1],
            fill: animations.appear.fill
          },
          {
            duration: move_to_pq_center_ms,
            translateX: relative_add(animations.move_to_pq_center.translateX),
            translateY: relative_add(animations.move_to_pq_center.translateY)
          },
          {
            duration: approach_pq_ms,
            translateX: relative_add(animations.approach_pq.translateX)
          },
          {
            duration: cross_half_pq_ms,
            translateX: relative_add(animations.cross_half_pq.translateX),
            opacity: animations.cross_half_pq.opacity
          },
        ]
      }
    };

    t[action.processed_by] = (t_offset + appear_ms + move_to_pq_center_ms + approach_pq_ms);

    const before_record = action.before.row.vars.record;
    const before_stream_data = by_name(before_record.stream);
    const before_part_data = before_stream_data.children.partitions[before_record.partition];
    const consumer_marker_id = before_part_data.vars.indexed_consumer_markers[action.processed_by];

    const consumer_marker_movement = {
      t: (t_offset + appear_ms + move_to_pq_center_ms + approach_pq_ms),
      params: {
        targets: `#${consumer_marker_id}`,
        easing: "linear",
        keyframes: [
          {
            duration: 1,
            opacity: animations.move_consumer_marker.opacity
          },
          {
            duration: consumer_marker_ms,
            translateX: relative_sub(animations.move_consumer_marker.translateX)
          }
        ]
      }
    };

    const card_id = action.after.row.children.row_card.id;

    const unhide_row_card = {
      t: t_offset,
      apply: function() {
        toggle_row_card_visibility(data_fns, card_id, true);
      },
      undo: function() {
        toggle_row_card_visibility(data_fns, card_id, false);
      }
    };

    const update_stream_time = {
      t: (t_offset + appear_ms + move_to_pq_center_ms + approach_pq_ms),
      apply: function() {
        update_stream_time_text(data_fns, action.processed_by, action.after);
      },
      undo: function() {
        update_stream_time_text(data_fns, action.processed_by, action.before);
      }
    };

    const update_pq_offsets$1 = {
      t: (t_offset + appear_ms + move_to_pq_center_ms + approach_pq_ms),
      apply: function() {
        update_pq_offsets(data_fns, action.processed_by, action.after.offsets);
      },
      undo: function() {
        update_pq_offsets(data_fns, action.processed_by, action.before.offsets);
      }
    };

    const hide_row_card = {
      t: (t_offset + appear_ms + move_to_pq_center_ms + approach_pq_ms + cross_half_pq_ms),
      apply: function() {
        toggle_row_card_visibility(data_fns, card_id, false);
      },
      undo: function() {
        toggle_row_card_visibility(data_fns, card_id, true);
      }
    };
    
    const commands = [
      row_movement,
      consumer_marker_movement
    ];

    const callbacks = [
      unhide_row_card,
      update_stream_time,
      update_pq_offsets$1,
      hide_row_card
    ];

    const pq_data = by_name(action.processed_by);

    if (pq_data.vars.stateful) {
      const mv_id = pq_data.children.materialized_view.id;
      const key = action.after.row.vars.record.key;

      // Need to capture the previous value in the apply
      // callback to get the right undo value.
      let previous_row = undefined;

      const update_materialized_view = {
        t: (t_offset + appear_ms + move_to_pq_center_ms + approach_pq_ms),
        apply: function() {
          const mv_data = by_id(mv_id);
          previous_row = cloneDeep_1(mv_data.vars.row_index[key]);

          // Need to unpack this in the callback since it may have changed.
          update_table(mv_data, action.after.row);
          pack(mv_data);
        },
        undo: function() {
          // Same here, unpack since it may have changed.
          const mv_data = by_id(mv_id);
          undo_row(mv_data, key, previous_row);
          pack(mv_data);
        }
      };

      callbacks.push(update_materialized_view);
    }

    return {
      commands,
      callbacks
    };
  }

  let update_layout_fns = {
    "keep": update_layout,
    "discard": update_layout,
    "absorb": update_layout
  };

  let animation_seq_fns = {
    "keep": animation_seq,
    "discard": animation_seq$1,
    "absorb": animation_seq$2
  };

  let anime_data_fns = {
    "keep": anime_data,
    "discard": anime_data$1,
    "absorb": anime_data$2
  };

  function init_animation_context() {
    return {
      t: {},
      history: {}
    };
  }

  function update_layout$1(action, data_fns, styles, free_el) {
    const { by_id } = data_fns;
    
    const layout_fn = update_layout_fns[action.kind];
    layout_fn(action, data_fns, styles, free_el);

    // The layout has mutated, so this row needs to be refreshed.
    action.after.row = by_id(action.after.row.id);
  }

  function animation_seq$3(action, data_fns, styles) {
    const animation_seq_fn = animation_seq_fns[action.kind];
    return animation_seq_fn(action, data_fns, styles);
  }

  function anime_data$3(ctx, action_animation_seq, data_fns, lineage, styles) {
    const anime_data_fn = anime_data_fns[action_animation_seq.kind];
    return anime_data_fn(ctx, action_animation_seq, data_fns, lineage, styles);
  }

  /** Used to compose bitmasks for cloning. */
  var CLONE_SYMBOLS_FLAG$2 = 4;

  /**
   * Creates a shallow clone of `value`.
   *
   * **Note:** This method is loosely based on the
   * [structured clone algorithm](https://mdn.io/Structured_clone_algorithm)
   * and supports cloning arrays, array buffers, booleans, date objects, maps,
   * numbers, `Object` objects, regexes, sets, strings, symbols, and typed
   * arrays. The own enumerable properties of `arguments` objects are cloned
   * as plain objects. An empty object is returned for uncloneable values such
   * as error objects, functions, DOM nodes, and WeakMaps.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to clone.
   * @returns {*} Returns the cloned value.
   * @see _.cloneDeep
   * @example
   *
   * var objects = [{ 'a': 1 }, { 'b': 2 }];
   *
   * var shallow = _.clone(objects);
   * console.log(shallow[0] === objects[0]);
   * // => true
   */
  function clone(value) {
    return _baseClone(value, CLONE_SYMBOLS_FLAG$2);
  }

  var clone_1 = clone;

  /**
   * Creates a function that returns `value`.
   *
   * @static
   * @memberOf _
   * @since 2.4.0
   * @category Util
   * @param {*} value The value to return from the new function.
   * @returns {Function} Returns the new constant function.
   * @example
   *
   * var objects = _.times(2, _.constant({ 'a': 1 }));
   *
   * console.log(objects);
   * // => [{ 'a': 1 }, { 'a': 1 }]
   *
   * console.log(objects[0] === objects[1]);
   * // => true
   */
  function constant(value) {
    return function() {
      return value;
    };
  }

  var constant_1 = constant;

  /**
   * Creates a base function for methods like `_.forIn` and `_.forOwn`.
   *
   * @private
   * @param {boolean} [fromRight] Specify iterating from right to left.
   * @returns {Function} Returns the new base function.
   */
  function createBaseFor(fromRight) {
    return function(object, iteratee, keysFunc) {
      var index = -1,
          iterable = Object(object),
          props = keysFunc(object),
          length = props.length;

      while (length--) {
        var key = props[fromRight ? length : ++index];
        if (iteratee(iterable[key], key, iterable) === false) {
          break;
        }
      }
      return object;
    };
  }

  var _createBaseFor = createBaseFor;

  /**
   * The base implementation of `baseForOwn` which iterates over `object`
   * properties returned by `keysFunc` and invokes `iteratee` for each property.
   * Iteratee functions may exit iteration early by explicitly returning `false`.
   *
   * @private
   * @param {Object} object The object to iterate over.
   * @param {Function} iteratee The function invoked per iteration.
   * @param {Function} keysFunc The function to get the keys of `object`.
   * @returns {Object} Returns `object`.
   */
  var baseFor = _createBaseFor();

  var _baseFor = baseFor;

  /**
   * The base implementation of `_.forOwn` without support for iteratee shorthands.
   *
   * @private
   * @param {Object} object The object to iterate over.
   * @param {Function} iteratee The function invoked per iteration.
   * @returns {Object} Returns `object`.
   */
  function baseForOwn(object, iteratee) {
    return object && _baseFor(object, iteratee, keys_1);
  }

  var _baseForOwn = baseForOwn;

  /**
   * Creates a `baseEach` or `baseEachRight` function.
   *
   * @private
   * @param {Function} eachFunc The function to iterate over a collection.
   * @param {boolean} [fromRight] Specify iterating from right to left.
   * @returns {Function} Returns the new base function.
   */
  function createBaseEach(eachFunc, fromRight) {
    return function(collection, iteratee) {
      if (collection == null) {
        return collection;
      }
      if (!isArrayLike_1(collection)) {
        return eachFunc(collection, iteratee);
      }
      var length = collection.length,
          index = fromRight ? length : -1,
          iterable = Object(collection);

      while ((fromRight ? index-- : ++index < length)) {
        if (iteratee(iterable[index], index, iterable) === false) {
          break;
        }
      }
      return collection;
    };
  }

  var _createBaseEach = createBaseEach;

  /**
   * The base implementation of `_.forEach` without support for iteratee shorthands.
   *
   * @private
   * @param {Array|Object} collection The collection to iterate over.
   * @param {Function} iteratee The function invoked per iteration.
   * @returns {Array|Object} Returns `collection`.
   */
  var baseEach = _createBaseEach(_baseForOwn);

  var _baseEach = baseEach;

  /**
   * This method returns the first argument it receives.
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category Util
   * @param {*} value Any value.
   * @returns {*} Returns `value`.
   * @example
   *
   * var object = { 'a': 1 };
   *
   * console.log(_.identity(object) === object);
   * // => true
   */
  function identity(value) {
    return value;
  }

  var identity_1 = identity;

  /**
   * Casts `value` to `identity` if it's not a function.
   *
   * @private
   * @param {*} value The value to inspect.
   * @returns {Function} Returns cast function.
   */
  function castFunction(value) {
    return typeof value == 'function' ? value : identity_1;
  }

  var _castFunction = castFunction;

  /**
   * Iterates over elements of `collection` and invokes `iteratee` for each element.
   * The iteratee is invoked with three arguments: (value, index|key, collection).
   * Iteratee functions may exit iteration early by explicitly returning `false`.
   *
   * **Note:** As with other "Collections" methods, objects with a "length"
   * property are iterated like arrays. To avoid this behavior use `_.forIn`
   * or `_.forOwn` for object iteration.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @alias each
   * @category Collection
   * @param {Array|Object} collection The collection to iterate over.
   * @param {Function} [iteratee=_.identity] The function invoked per iteration.
   * @returns {Array|Object} Returns `collection`.
   * @see _.forEachRight
   * @example
   *
   * _.forEach([1, 2], function(value) {
   *   console.log(value);
   * });
   * // => Logs `1` then `2`.
   *
   * _.forEach({ 'a': 1, 'b': 2 }, function(value, key) {
   *   console.log(key);
   * });
   * // => Logs 'a' then 'b' (iteration order is not guaranteed).
   */
  function forEach(collection, iteratee) {
    var func = isArray_1(collection) ? _arrayEach : _baseEach;
    return func(collection, _castFunction(iteratee));
  }

  var forEach_1 = forEach;

  var each = forEach_1;

  /**
   * The base implementation of `_.filter` without support for iteratee shorthands.
   *
   * @private
   * @param {Array|Object} collection The collection to iterate over.
   * @param {Function} predicate The function invoked per iteration.
   * @returns {Array} Returns the new filtered array.
   */
  function baseFilter(collection, predicate) {
    var result = [];
    _baseEach(collection, function(value, index, collection) {
      if (predicate(value, index, collection)) {
        result.push(value);
      }
    });
    return result;
  }

  var _baseFilter = baseFilter;

  /** Used to stand-in for `undefined` hash values. */
  var HASH_UNDEFINED$2 = '__lodash_hash_undefined__';

  /**
   * Adds `value` to the array cache.
   *
   * @private
   * @name add
   * @memberOf SetCache
   * @alias push
   * @param {*} value The value to cache.
   * @returns {Object} Returns the cache instance.
   */
  function setCacheAdd(value) {
    this.__data__.set(value, HASH_UNDEFINED$2);
    return this;
  }

  var _setCacheAdd = setCacheAdd;

  /**
   * Checks if `value` is in the array cache.
   *
   * @private
   * @name has
   * @memberOf SetCache
   * @param {*} value The value to search for.
   * @returns {number} Returns `true` if `value` is found, else `false`.
   */
  function setCacheHas(value) {
    return this.__data__.has(value);
  }

  var _setCacheHas = setCacheHas;

  /**
   *
   * Creates an array cache object to store unique values.
   *
   * @private
   * @constructor
   * @param {Array} [values] The values to cache.
   */
  function SetCache(values) {
    var index = -1,
        length = values == null ? 0 : values.length;

    this.__data__ = new _MapCache;
    while (++index < length) {
      this.add(values[index]);
    }
  }

  // Add methods to `SetCache`.
  SetCache.prototype.add = SetCache.prototype.push = _setCacheAdd;
  SetCache.prototype.has = _setCacheHas;

  var _SetCache = SetCache;

  /**
   * A specialized version of `_.some` for arrays without support for iteratee
   * shorthands.
   *
   * @private
   * @param {Array} [array] The array to iterate over.
   * @param {Function} predicate The function invoked per iteration.
   * @returns {boolean} Returns `true` if any element passes the predicate check,
   *  else `false`.
   */
  function arraySome(array, predicate) {
    var index = -1,
        length = array == null ? 0 : array.length;

    while (++index < length) {
      if (predicate(array[index], index, array)) {
        return true;
      }
    }
    return false;
  }

  var _arraySome = arraySome;

  /**
   * Checks if a `cache` value for `key` exists.
   *
   * @private
   * @param {Object} cache The cache to query.
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function cacheHas(cache, key) {
    return cache.has(key);
  }

  var _cacheHas = cacheHas;

  /** Used to compose bitmasks for value comparisons. */
  var COMPARE_PARTIAL_FLAG = 1,
      COMPARE_UNORDERED_FLAG = 2;

  /**
   * A specialized version of `baseIsEqualDeep` for arrays with support for
   * partial deep comparisons.
   *
   * @private
   * @param {Array} array The array to compare.
   * @param {Array} other The other array to compare.
   * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
   * @param {Function} customizer The function to customize comparisons.
   * @param {Function} equalFunc The function to determine equivalents of values.
   * @param {Object} stack Tracks traversed `array` and `other` objects.
   * @returns {boolean} Returns `true` if the arrays are equivalent, else `false`.
   */
  function equalArrays(array, other, bitmask, customizer, equalFunc, stack) {
    var isPartial = bitmask & COMPARE_PARTIAL_FLAG,
        arrLength = array.length,
        othLength = other.length;

    if (arrLength != othLength && !(isPartial && othLength > arrLength)) {
      return false;
    }
    // Assume cyclic values are equal.
    var stacked = stack.get(array);
    if (stacked && stack.get(other)) {
      return stacked == other;
    }
    var index = -1,
        result = true,
        seen = (bitmask & COMPARE_UNORDERED_FLAG) ? new _SetCache : undefined;

    stack.set(array, other);
    stack.set(other, array);

    // Ignore non-index properties.
    while (++index < arrLength) {
      var arrValue = array[index],
          othValue = other[index];

      if (customizer) {
        var compared = isPartial
          ? customizer(othValue, arrValue, index, other, array, stack)
          : customizer(arrValue, othValue, index, array, other, stack);
      }
      if (compared !== undefined) {
        if (compared) {
          continue;
        }
        result = false;
        break;
      }
      // Recursively compare arrays (susceptible to call stack limits).
      if (seen) {
        if (!_arraySome(other, function(othValue, othIndex) {
              if (!_cacheHas(seen, othIndex) &&
                  (arrValue === othValue || equalFunc(arrValue, othValue, bitmask, customizer, stack))) {
                return seen.push(othIndex);
              }
            })) {
          result = false;
          break;
        }
      } else if (!(
            arrValue === othValue ||
              equalFunc(arrValue, othValue, bitmask, customizer, stack)
          )) {
        result = false;
        break;
      }
    }
    stack['delete'](array);
    stack['delete'](other);
    return result;
  }

  var _equalArrays = equalArrays;

  /**
   * Converts `map` to its key-value pairs.
   *
   * @private
   * @param {Object} map The map to convert.
   * @returns {Array} Returns the key-value pairs.
   */
  function mapToArray(map) {
    var index = -1,
        result = Array(map.size);

    map.forEach(function(value, key) {
      result[++index] = [key, value];
    });
    return result;
  }

  var _mapToArray = mapToArray;

  /**
   * Converts `set` to an array of its values.
   *
   * @private
   * @param {Object} set The set to convert.
   * @returns {Array} Returns the values.
   */
  function setToArray(set) {
    var index = -1,
        result = Array(set.size);

    set.forEach(function(value) {
      result[++index] = value;
    });
    return result;
  }

  var _setToArray = setToArray;

  /** Used to compose bitmasks for value comparisons. */
  var COMPARE_PARTIAL_FLAG$1 = 1,
      COMPARE_UNORDERED_FLAG$1 = 2;

  /** `Object#toString` result references. */
  var boolTag$3 = '[object Boolean]',
      dateTag$3 = '[object Date]',
      errorTag$2 = '[object Error]',
      mapTag$5 = '[object Map]',
      numberTag$3 = '[object Number]',
      regexpTag$3 = '[object RegExp]',
      setTag$5 = '[object Set]',
      stringTag$3 = '[object String]',
      symbolTag$2 = '[object Symbol]';

  var arrayBufferTag$3 = '[object ArrayBuffer]',
      dataViewTag$4 = '[object DataView]';

  /** Used to convert symbols to primitives and strings. */
  var symbolProto$1 = _Symbol ? _Symbol.prototype : undefined,
      symbolValueOf$1 = symbolProto$1 ? symbolProto$1.valueOf : undefined;

  /**
   * A specialized version of `baseIsEqualDeep` for comparing objects of
   * the same `toStringTag`.
   *
   * **Note:** This function only supports comparing values with tags of
   * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
   *
   * @private
   * @param {Object} object The object to compare.
   * @param {Object} other The other object to compare.
   * @param {string} tag The `toStringTag` of the objects to compare.
   * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
   * @param {Function} customizer The function to customize comparisons.
   * @param {Function} equalFunc The function to determine equivalents of values.
   * @param {Object} stack Tracks traversed `object` and `other` objects.
   * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
   */
  function equalByTag(object, other, tag, bitmask, customizer, equalFunc, stack) {
    switch (tag) {
      case dataViewTag$4:
        if ((object.byteLength != other.byteLength) ||
            (object.byteOffset != other.byteOffset)) {
          return false;
        }
        object = object.buffer;
        other = other.buffer;

      case arrayBufferTag$3:
        if ((object.byteLength != other.byteLength) ||
            !equalFunc(new _Uint8Array(object), new _Uint8Array(other))) {
          return false;
        }
        return true;

      case boolTag$3:
      case dateTag$3:
      case numberTag$3:
        // Coerce booleans to `1` or `0` and dates to milliseconds.
        // Invalid dates are coerced to `NaN`.
        return eq_1(+object, +other);

      case errorTag$2:
        return object.name == other.name && object.message == other.message;

      case regexpTag$3:
      case stringTag$3:
        // Coerce regexes to strings and treat strings, primitives and objects,
        // as equal. See http://www.ecma-international.org/ecma-262/7.0/#sec-regexp.prototype.tostring
        // for more details.
        return object == (other + '');

      case mapTag$5:
        var convert = _mapToArray;

      case setTag$5:
        var isPartial = bitmask & COMPARE_PARTIAL_FLAG$1;
        convert || (convert = _setToArray);

        if (object.size != other.size && !isPartial) {
          return false;
        }
        // Assume cyclic values are equal.
        var stacked = stack.get(object);
        if (stacked) {
          return stacked == other;
        }
        bitmask |= COMPARE_UNORDERED_FLAG$1;

        // Recursively compare objects (susceptible to call stack limits).
        stack.set(object, other);
        var result = _equalArrays(convert(object), convert(other), bitmask, customizer, equalFunc, stack);
        stack['delete'](object);
        return result;

      case symbolTag$2:
        if (symbolValueOf$1) {
          return symbolValueOf$1.call(object) == symbolValueOf$1.call(other);
        }
    }
    return false;
  }

  var _equalByTag = equalByTag;

  /** Used to compose bitmasks for value comparisons. */
  var COMPARE_PARTIAL_FLAG$2 = 1;

  /** Used for built-in method references. */
  var objectProto$d = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$a = objectProto$d.hasOwnProperty;

  /**
   * A specialized version of `baseIsEqualDeep` for objects with support for
   * partial deep comparisons.
   *
   * @private
   * @param {Object} object The object to compare.
   * @param {Object} other The other object to compare.
   * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
   * @param {Function} customizer The function to customize comparisons.
   * @param {Function} equalFunc The function to determine equivalents of values.
   * @param {Object} stack Tracks traversed `object` and `other` objects.
   * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
   */
  function equalObjects(object, other, bitmask, customizer, equalFunc, stack) {
    var isPartial = bitmask & COMPARE_PARTIAL_FLAG$2,
        objProps = _getAllKeys(object),
        objLength = objProps.length,
        othProps = _getAllKeys(other),
        othLength = othProps.length;

    if (objLength != othLength && !isPartial) {
      return false;
    }
    var index = objLength;
    while (index--) {
      var key = objProps[index];
      if (!(isPartial ? key in other : hasOwnProperty$a.call(other, key))) {
        return false;
      }
    }
    // Assume cyclic values are equal.
    var stacked = stack.get(object);
    if (stacked && stack.get(other)) {
      return stacked == other;
    }
    var result = true;
    stack.set(object, other);
    stack.set(other, object);

    var skipCtor = isPartial;
    while (++index < objLength) {
      key = objProps[index];
      var objValue = object[key],
          othValue = other[key];

      if (customizer) {
        var compared = isPartial
          ? customizer(othValue, objValue, key, other, object, stack)
          : customizer(objValue, othValue, key, object, other, stack);
      }
      // Recursively compare objects (susceptible to call stack limits).
      if (!(compared === undefined
            ? (objValue === othValue || equalFunc(objValue, othValue, bitmask, customizer, stack))
            : compared
          )) {
        result = false;
        break;
      }
      skipCtor || (skipCtor = key == 'constructor');
    }
    if (result && !skipCtor) {
      var objCtor = object.constructor,
          othCtor = other.constructor;

      // Non `Object` object instances with different constructors are not equal.
      if (objCtor != othCtor &&
          ('constructor' in object && 'constructor' in other) &&
          !(typeof objCtor == 'function' && objCtor instanceof objCtor &&
            typeof othCtor == 'function' && othCtor instanceof othCtor)) {
        result = false;
      }
    }
    stack['delete'](object);
    stack['delete'](other);
    return result;
  }

  var _equalObjects = equalObjects;

  /** Used to compose bitmasks for value comparisons. */
  var COMPARE_PARTIAL_FLAG$3 = 1;

  /** `Object#toString` result references. */
  var argsTag$3 = '[object Arguments]',
      arrayTag$2 = '[object Array]',
      objectTag$3 = '[object Object]';

  /** Used for built-in method references. */
  var objectProto$e = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$b = objectProto$e.hasOwnProperty;

  /**
   * A specialized version of `baseIsEqual` for arrays and objects which performs
   * deep comparisons and tracks traversed objects enabling objects with circular
   * references to be compared.
   *
   * @private
   * @param {Object} object The object to compare.
   * @param {Object} other The other object to compare.
   * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
   * @param {Function} customizer The function to customize comparisons.
   * @param {Function} equalFunc The function to determine equivalents of values.
   * @param {Object} [stack] Tracks traversed `object` and `other` objects.
   * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
   */
  function baseIsEqualDeep(object, other, bitmask, customizer, equalFunc, stack) {
    var objIsArr = isArray_1(object),
        othIsArr = isArray_1(other),
        objTag = objIsArr ? arrayTag$2 : _getTag(object),
        othTag = othIsArr ? arrayTag$2 : _getTag(other);

    objTag = objTag == argsTag$3 ? objectTag$3 : objTag;
    othTag = othTag == argsTag$3 ? objectTag$3 : othTag;

    var objIsObj = objTag == objectTag$3,
        othIsObj = othTag == objectTag$3,
        isSameTag = objTag == othTag;

    if (isSameTag && isBuffer_1(object)) {
      if (!isBuffer_1(other)) {
        return false;
      }
      objIsArr = true;
      objIsObj = false;
    }
    if (isSameTag && !objIsObj) {
      stack || (stack = new _Stack);
      return (objIsArr || isTypedArray_1(object))
        ? _equalArrays(object, other, bitmask, customizer, equalFunc, stack)
        : _equalByTag(object, other, objTag, bitmask, customizer, equalFunc, stack);
    }
    if (!(bitmask & COMPARE_PARTIAL_FLAG$3)) {
      var objIsWrapped = objIsObj && hasOwnProperty$b.call(object, '__wrapped__'),
          othIsWrapped = othIsObj && hasOwnProperty$b.call(other, '__wrapped__');

      if (objIsWrapped || othIsWrapped) {
        var objUnwrapped = objIsWrapped ? object.value() : object,
            othUnwrapped = othIsWrapped ? other.value() : other;

        stack || (stack = new _Stack);
        return equalFunc(objUnwrapped, othUnwrapped, bitmask, customizer, stack);
      }
    }
    if (!isSameTag) {
      return false;
    }
    stack || (stack = new _Stack);
    return _equalObjects(object, other, bitmask, customizer, equalFunc, stack);
  }

  var _baseIsEqualDeep = baseIsEqualDeep;

  /**
   * The base implementation of `_.isEqual` which supports partial comparisons
   * and tracks traversed objects.
   *
   * @private
   * @param {*} value The value to compare.
   * @param {*} other The other value to compare.
   * @param {boolean} bitmask The bitmask flags.
   *  1 - Unordered comparison
   *  2 - Partial comparison
   * @param {Function} [customizer] The function to customize comparisons.
   * @param {Object} [stack] Tracks traversed `value` and `other` objects.
   * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
   */
  function baseIsEqual(value, other, bitmask, customizer, stack) {
    if (value === other) {
      return true;
    }
    if (value == null || other == null || (!isObjectLike_1(value) && !isObjectLike_1(other))) {
      return value !== value && other !== other;
    }
    return _baseIsEqualDeep(value, other, bitmask, customizer, baseIsEqual, stack);
  }

  var _baseIsEqual = baseIsEqual;

  /** Used to compose bitmasks for value comparisons. */
  var COMPARE_PARTIAL_FLAG$4 = 1,
      COMPARE_UNORDERED_FLAG$2 = 2;

  /**
   * The base implementation of `_.isMatch` without support for iteratee shorthands.
   *
   * @private
   * @param {Object} object The object to inspect.
   * @param {Object} source The object of property values to match.
   * @param {Array} matchData The property names, values, and compare flags to match.
   * @param {Function} [customizer] The function to customize comparisons.
   * @returns {boolean} Returns `true` if `object` is a match, else `false`.
   */
  function baseIsMatch(object, source, matchData, customizer) {
    var index = matchData.length,
        length = index,
        noCustomizer = !customizer;

    if (object == null) {
      return !length;
    }
    object = Object(object);
    while (index--) {
      var data = matchData[index];
      if ((noCustomizer && data[2])
            ? data[1] !== object[data[0]]
            : !(data[0] in object)
          ) {
        return false;
      }
    }
    while (++index < length) {
      data = matchData[index];
      var key = data[0],
          objValue = object[key],
          srcValue = data[1];

      if (noCustomizer && data[2]) {
        if (objValue === undefined && !(key in object)) {
          return false;
        }
      } else {
        var stack = new _Stack;
        if (customizer) {
          var result = customizer(objValue, srcValue, key, object, source, stack);
        }
        if (!(result === undefined
              ? _baseIsEqual(srcValue, objValue, COMPARE_PARTIAL_FLAG$4 | COMPARE_UNORDERED_FLAG$2, customizer, stack)
              : result
            )) {
          return false;
        }
      }
    }
    return true;
  }

  var _baseIsMatch = baseIsMatch;

  /**
   * Checks if `value` is suitable for strict equality comparisons, i.e. `===`.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` if suitable for strict
   *  equality comparisons, else `false`.
   */
  function isStrictComparable(value) {
    return value === value && !isObject_1(value);
  }

  var _isStrictComparable = isStrictComparable;

  /**
   * Gets the property names, values, and compare flags of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the match data of `object`.
   */
  function getMatchData(object) {
    var result = keys_1(object),
        length = result.length;

    while (length--) {
      var key = result[length],
          value = object[key];

      result[length] = [key, value, _isStrictComparable(value)];
    }
    return result;
  }

  var _getMatchData = getMatchData;

  /**
   * A specialized version of `matchesProperty` for source values suitable
   * for strict equality comparisons, i.e. `===`.
   *
   * @private
   * @param {string} key The key of the property to get.
   * @param {*} srcValue The value to match.
   * @returns {Function} Returns the new spec function.
   */
  function matchesStrictComparable(key, srcValue) {
    return function(object) {
      if (object == null) {
        return false;
      }
      return object[key] === srcValue &&
        (srcValue !== undefined || (key in Object(object)));
    };
  }

  var _matchesStrictComparable = matchesStrictComparable;

  /**
   * The base implementation of `_.matches` which doesn't clone `source`.
   *
   * @private
   * @param {Object} source The object of property values to match.
   * @returns {Function} Returns the new spec function.
   */
  function baseMatches(source) {
    var matchData = _getMatchData(source);
    if (matchData.length == 1 && matchData[0][2]) {
      return _matchesStrictComparable(matchData[0][0], matchData[0][1]);
    }
    return function(object) {
      return object === source || _baseIsMatch(object, source, matchData);
    };
  }

  var _baseMatches = baseMatches;

  /** `Object#toString` result references. */
  var symbolTag$3 = '[object Symbol]';

  /**
   * Checks if `value` is classified as a `Symbol` primitive or object.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
   * @example
   *
   * _.isSymbol(Symbol.iterator);
   * // => true
   *
   * _.isSymbol('abc');
   * // => false
   */
  function isSymbol(value) {
    return typeof value == 'symbol' ||
      (isObjectLike_1(value) && _baseGetTag(value) == symbolTag$3);
  }

  var isSymbol_1 = isSymbol;

  /** Used to match property names within property paths. */
  var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,
      reIsPlainProp = /^\w*$/;

  /**
   * Checks if `value` is a property name and not a property path.
   *
   * @private
   * @param {*} value The value to check.
   * @param {Object} [object] The object to query keys on.
   * @returns {boolean} Returns `true` if `value` is a property name, else `false`.
   */
  function isKey(value, object) {
    if (isArray_1(value)) {
      return false;
    }
    var type = typeof value;
    if (type == 'number' || type == 'symbol' || type == 'boolean' ||
        value == null || isSymbol_1(value)) {
      return true;
    }
    return reIsPlainProp.test(value) || !reIsDeepProp.test(value) ||
      (object != null && value in Object(object));
  }

  var _isKey = isKey;

  /** Error message constants. */
  var FUNC_ERROR_TEXT = 'Expected a function';

  /**
   * Creates a function that memoizes the result of `func`. If `resolver` is
   * provided, it determines the cache key for storing the result based on the
   * arguments provided to the memoized function. By default, the first argument
   * provided to the memoized function is used as the map cache key. The `func`
   * is invoked with the `this` binding of the memoized function.
   *
   * **Note:** The cache is exposed as the `cache` property on the memoized
   * function. Its creation may be customized by replacing the `_.memoize.Cache`
   * constructor with one whose instances implement the
   * [`Map`](http://ecma-international.org/ecma-262/7.0/#sec-properties-of-the-map-prototype-object)
   * method interface of `clear`, `delete`, `get`, `has`, and `set`.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Function
   * @param {Function} func The function to have its output memoized.
   * @param {Function} [resolver] The function to resolve the cache key.
   * @returns {Function} Returns the new memoized function.
   * @example
   *
   * var object = { 'a': 1, 'b': 2 };
   * var other = { 'c': 3, 'd': 4 };
   *
   * var values = _.memoize(_.values);
   * values(object);
   * // => [1, 2]
   *
   * values(other);
   * // => [3, 4]
   *
   * object.a = 2;
   * values(object);
   * // => [1, 2]
   *
   * // Modify the result cache.
   * values.cache.set(object, ['a', 'b']);
   * values(object);
   * // => ['a', 'b']
   *
   * // Replace `_.memoize.Cache`.
   * _.memoize.Cache = WeakMap;
   */
  function memoize(func, resolver) {
    if (typeof func != 'function' || (resolver != null && typeof resolver != 'function')) {
      throw new TypeError(FUNC_ERROR_TEXT);
    }
    var memoized = function() {
      var args = arguments,
          key = resolver ? resolver.apply(this, args) : args[0],
          cache = memoized.cache;

      if (cache.has(key)) {
        return cache.get(key);
      }
      var result = func.apply(this, args);
      memoized.cache = cache.set(key, result) || cache;
      return result;
    };
    memoized.cache = new (memoize.Cache || _MapCache);
    return memoized;
  }

  // Expose `MapCache`.
  memoize.Cache = _MapCache;

  var memoize_1 = memoize;

  /** Used as the maximum memoize cache size. */
  var MAX_MEMOIZE_SIZE = 500;

  /**
   * A specialized version of `_.memoize` which clears the memoized function's
   * cache when it exceeds `MAX_MEMOIZE_SIZE`.
   *
   * @private
   * @param {Function} func The function to have its output memoized.
   * @returns {Function} Returns the new memoized function.
   */
  function memoizeCapped(func) {
    var result = memoize_1(func, function(key) {
      if (cache.size === MAX_MEMOIZE_SIZE) {
        cache.clear();
      }
      return key;
    });

    var cache = result.cache;
    return result;
  }

  var _memoizeCapped = memoizeCapped;

  /** Used to match property names within property paths. */
  var rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;

  /** Used to match backslashes in property paths. */
  var reEscapeChar = /\\(\\)?/g;

  /**
   * Converts `string` to a property path array.
   *
   * @private
   * @param {string} string The string to convert.
   * @returns {Array} Returns the property path array.
   */
  var stringToPath = _memoizeCapped(function(string) {
    var result = [];
    if (string.charCodeAt(0) === 46 /* . */) {
      result.push('');
    }
    string.replace(rePropName, function(match, number, quote, subString) {
      result.push(quote ? subString.replace(reEscapeChar, '$1') : (number || match));
    });
    return result;
  });

  var _stringToPath = stringToPath;

  /**
   * A specialized version of `_.map` for arrays without support for iteratee
   * shorthands.
   *
   * @private
   * @param {Array} [array] The array to iterate over.
   * @param {Function} iteratee The function invoked per iteration.
   * @returns {Array} Returns the new mapped array.
   */
  function arrayMap(array, iteratee) {
    var index = -1,
        length = array == null ? 0 : array.length,
        result = Array(length);

    while (++index < length) {
      result[index] = iteratee(array[index], index, array);
    }
    return result;
  }

  var _arrayMap = arrayMap;

  /** Used as references for various `Number` constants. */
  var INFINITY = 1 / 0;

  /** Used to convert symbols to primitives and strings. */
  var symbolProto$2 = _Symbol ? _Symbol.prototype : undefined,
      symbolToString = symbolProto$2 ? symbolProto$2.toString : undefined;

  /**
   * The base implementation of `_.toString` which doesn't convert nullish
   * values to empty strings.
   *
   * @private
   * @param {*} value The value to process.
   * @returns {string} Returns the string.
   */
  function baseToString(value) {
    // Exit early for strings to avoid a performance hit in some environments.
    if (typeof value == 'string') {
      return value;
    }
    if (isArray_1(value)) {
      // Recursively convert values (susceptible to call stack limits).
      return _arrayMap(value, baseToString) + '';
    }
    if (isSymbol_1(value)) {
      return symbolToString ? symbolToString.call(value) : '';
    }
    var result = (value + '');
    return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
  }

  var _baseToString = baseToString;

  /**
   * Converts `value` to a string. An empty string is returned for `null`
   * and `undefined` values. The sign of `-0` is preserved.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to convert.
   * @returns {string} Returns the converted string.
   * @example
   *
   * _.toString(null);
   * // => ''
   *
   * _.toString(-0);
   * // => '-0'
   *
   * _.toString([1, 2, 3]);
   * // => '1,2,3'
   */
  function toString(value) {
    return value == null ? '' : _baseToString(value);
  }

  var toString_1 = toString;

  /**
   * Casts `value` to a path array if it's not one.
   *
   * @private
   * @param {*} value The value to inspect.
   * @param {Object} [object] The object to query keys on.
   * @returns {Array} Returns the cast property path array.
   */
  function castPath(value, object) {
    if (isArray_1(value)) {
      return value;
    }
    return _isKey(value, object) ? [value] : _stringToPath(toString_1(value));
  }

  var _castPath = castPath;

  /** Used as references for various `Number` constants. */
  var INFINITY$1 = 1 / 0;

  /**
   * Converts `value` to a string key if it's not a string or symbol.
   *
   * @private
   * @param {*} value The value to inspect.
   * @returns {string|symbol} Returns the key.
   */
  function toKey(value) {
    if (typeof value == 'string' || isSymbol_1(value)) {
      return value;
    }
    var result = (value + '');
    return (result == '0' && (1 / value) == -INFINITY$1) ? '-0' : result;
  }

  var _toKey = toKey;

  /**
   * The base implementation of `_.get` without support for default values.
   *
   * @private
   * @param {Object} object The object to query.
   * @param {Array|string} path The path of the property to get.
   * @returns {*} Returns the resolved value.
   */
  function baseGet(object, path) {
    path = _castPath(path, object);

    var index = 0,
        length = path.length;

    while (object != null && index < length) {
      object = object[_toKey(path[index++])];
    }
    return (index && index == length) ? object : undefined;
  }

  var _baseGet = baseGet;

  /**
   * Gets the value at `path` of `object`. If the resolved value is
   * `undefined`, the `defaultValue` is returned in its place.
   *
   * @static
   * @memberOf _
   * @since 3.7.0
   * @category Object
   * @param {Object} object The object to query.
   * @param {Array|string} path The path of the property to get.
   * @param {*} [defaultValue] The value returned for `undefined` resolved values.
   * @returns {*} Returns the resolved value.
   * @example
   *
   * var object = { 'a': [{ 'b': { 'c': 3 } }] };
   *
   * _.get(object, 'a[0].b.c');
   * // => 3
   *
   * _.get(object, ['a', '0', 'b', 'c']);
   * // => 3
   *
   * _.get(object, 'a.b.c', 'default');
   * // => 'default'
   */
  function get(object, path, defaultValue) {
    var result = object == null ? undefined : _baseGet(object, path);
    return result === undefined ? defaultValue : result;
  }

  var get_1 = get;

  /**
   * The base implementation of `_.hasIn` without support for deep paths.
   *
   * @private
   * @param {Object} [object] The object to query.
   * @param {Array|string} key The key to check.
   * @returns {boolean} Returns `true` if `key` exists, else `false`.
   */
  function baseHasIn(object, key) {
    return object != null && key in Object(object);
  }

  var _baseHasIn = baseHasIn;

  /**
   * Checks if `path` exists on `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @param {Array|string} path The path to check.
   * @param {Function} hasFunc The function to check properties.
   * @returns {boolean} Returns `true` if `path` exists, else `false`.
   */
  function hasPath(object, path, hasFunc) {
    path = _castPath(path, object);

    var index = -1,
        length = path.length,
        result = false;

    while (++index < length) {
      var key = _toKey(path[index]);
      if (!(result = object != null && hasFunc(object, key))) {
        break;
      }
      object = object[key];
    }
    if (result || ++index != length) {
      return result;
    }
    length = object == null ? 0 : object.length;
    return !!length && isLength_1(length) && _isIndex(key, length) &&
      (isArray_1(object) || isArguments_1(object));
  }

  var _hasPath = hasPath;

  /**
   * Checks if `path` is a direct or inherited property of `object`.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Object
   * @param {Object} object The object to query.
   * @param {Array|string} path The path to check.
   * @returns {boolean} Returns `true` if `path` exists, else `false`.
   * @example
   *
   * var object = _.create({ 'a': _.create({ 'b': 2 }) });
   *
   * _.hasIn(object, 'a');
   * // => true
   *
   * _.hasIn(object, 'a.b');
   * // => true
   *
   * _.hasIn(object, ['a', 'b']);
   * // => true
   *
   * _.hasIn(object, 'b');
   * // => false
   */
  function hasIn(object, path) {
    return object != null && _hasPath(object, path, _baseHasIn);
  }

  var hasIn_1 = hasIn;

  /** Used to compose bitmasks for value comparisons. */
  var COMPARE_PARTIAL_FLAG$5 = 1,
      COMPARE_UNORDERED_FLAG$3 = 2;

  /**
   * The base implementation of `_.matchesProperty` which doesn't clone `srcValue`.
   *
   * @private
   * @param {string} path The path of the property to get.
   * @param {*} srcValue The value to match.
   * @returns {Function} Returns the new spec function.
   */
  function baseMatchesProperty(path, srcValue) {
    if (_isKey(path) && _isStrictComparable(srcValue)) {
      return _matchesStrictComparable(_toKey(path), srcValue);
    }
    return function(object) {
      var objValue = get_1(object, path);
      return (objValue === undefined && objValue === srcValue)
        ? hasIn_1(object, path)
        : _baseIsEqual(srcValue, objValue, COMPARE_PARTIAL_FLAG$5 | COMPARE_UNORDERED_FLAG$3);
    };
  }

  var _baseMatchesProperty = baseMatchesProperty;

  /**
   * The base implementation of `_.property` without support for deep paths.
   *
   * @private
   * @param {string} key The key of the property to get.
   * @returns {Function} Returns the new accessor function.
   */
  function baseProperty(key) {
    return function(object) {
      return object == null ? undefined : object[key];
    };
  }

  var _baseProperty = baseProperty;

  /**
   * A specialized version of `baseProperty` which supports deep paths.
   *
   * @private
   * @param {Array|string} path The path of the property to get.
   * @returns {Function} Returns the new accessor function.
   */
  function basePropertyDeep(path) {
    return function(object) {
      return _baseGet(object, path);
    };
  }

  var _basePropertyDeep = basePropertyDeep;

  /**
   * Creates a function that returns the value at `path` of a given object.
   *
   * @static
   * @memberOf _
   * @since 2.4.0
   * @category Util
   * @param {Array|string} path The path of the property to get.
   * @returns {Function} Returns the new accessor function.
   * @example
   *
   * var objects = [
   *   { 'a': { 'b': 2 } },
   *   { 'a': { 'b': 1 } }
   * ];
   *
   * _.map(objects, _.property('a.b'));
   * // => [2, 1]
   *
   * _.map(_.sortBy(objects, _.property(['a', 'b'])), 'a.b');
   * // => [1, 2]
   */
  function property(path) {
    return _isKey(path) ? _baseProperty(_toKey(path)) : _basePropertyDeep(path);
  }

  var property_1 = property;

  /**
   * The base implementation of `_.iteratee`.
   *
   * @private
   * @param {*} [value=_.identity] The value to convert to an iteratee.
   * @returns {Function} Returns the iteratee.
   */
  function baseIteratee(value) {
    // Don't store the `typeof` result in a variable to avoid a JIT bug in Safari 9.
    // See https://bugs.webkit.org/show_bug.cgi?id=156034 for more details.
    if (typeof value == 'function') {
      return value;
    }
    if (value == null) {
      return identity_1;
    }
    if (typeof value == 'object') {
      return isArray_1(value)
        ? _baseMatchesProperty(value[0], value[1])
        : _baseMatches(value);
    }
    return property_1(value);
  }

  var _baseIteratee = baseIteratee;

  /**
   * Iterates over elements of `collection`, returning an array of all elements
   * `predicate` returns truthy for. The predicate is invoked with three
   * arguments: (value, index|key, collection).
   *
   * **Note:** Unlike `_.remove`, this method returns a new array.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Collection
   * @param {Array|Object} collection The collection to iterate over.
   * @param {Function} [predicate=_.identity] The function invoked per iteration.
   * @returns {Array} Returns the new filtered array.
   * @see _.reject
   * @example
   *
   * var users = [
   *   { 'user': 'barney', 'age': 36, 'active': true },
   *   { 'user': 'fred',   'age': 40, 'active': false }
   * ];
   *
   * _.filter(users, function(o) { return !o.active; });
   * // => objects for ['fred']
   *
   * // The `_.matches` iteratee shorthand.
   * _.filter(users, { 'age': 36, 'active': true });
   * // => objects for ['barney']
   *
   * // The `_.matchesProperty` iteratee shorthand.
   * _.filter(users, ['active', false]);
   * // => objects for ['fred']
   *
   * // The `_.property` iteratee shorthand.
   * _.filter(users, 'active');
   * // => objects for ['barney']
   */
  function filter(collection, predicate) {
    var func = isArray_1(collection) ? _arrayFilter : _baseFilter;
    return func(collection, _baseIteratee(predicate));
  }

  var filter_1 = filter;

  /** Used for built-in method references. */
  var objectProto$f = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$c = objectProto$f.hasOwnProperty;

  /**
   * The base implementation of `_.has` without support for deep paths.
   *
   * @private
   * @param {Object} [object] The object to query.
   * @param {Array|string} key The key to check.
   * @returns {boolean} Returns `true` if `key` exists, else `false`.
   */
  function baseHas(object, key) {
    return object != null && hasOwnProperty$c.call(object, key);
  }

  var _baseHas = baseHas;

  /**
   * Checks if `path` is a direct property of `object`.
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category Object
   * @param {Object} object The object to query.
   * @param {Array|string} path The path to check.
   * @returns {boolean} Returns `true` if `path` exists, else `false`.
   * @example
   *
   * var object = { 'a': { 'b': 2 } };
   * var other = _.create({ 'a': _.create({ 'b': 2 }) });
   *
   * _.has(object, 'a');
   * // => true
   *
   * _.has(object, 'a.b');
   * // => true
   *
   * _.has(object, ['a', 'b']);
   * // => true
   *
   * _.has(other, 'a');
   * // => false
   */
  function has(object, path) {
    return object != null && _hasPath(object, path, _baseHas);
  }

  var has_1 = has;

  /** `Object#toString` result references. */
  var mapTag$6 = '[object Map]',
      setTag$6 = '[object Set]';

  /** Used for built-in method references. */
  var objectProto$g = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$d = objectProto$g.hasOwnProperty;

  /**
   * Checks if `value` is an empty object, collection, map, or set.
   *
   * Objects are considered empty if they have no own enumerable string keyed
   * properties.
   *
   * Array-like values such as `arguments` objects, arrays, buffers, strings, or
   * jQuery-like collections are considered empty if they have a `length` of `0`.
   * Similarly, maps and sets are considered empty if they have a `size` of `0`.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is empty, else `false`.
   * @example
   *
   * _.isEmpty(null);
   * // => true
   *
   * _.isEmpty(true);
   * // => true
   *
   * _.isEmpty(1);
   * // => true
   *
   * _.isEmpty([1, 2, 3]);
   * // => false
   *
   * _.isEmpty({ 'a': 1 });
   * // => false
   */
  function isEmpty(value) {
    if (value == null) {
      return true;
    }
    if (isArrayLike_1(value) &&
        (isArray_1(value) || typeof value == 'string' || typeof value.splice == 'function' ||
          isBuffer_1(value) || isTypedArray_1(value) || isArguments_1(value))) {
      return !value.length;
    }
    var tag = _getTag(value);
    if (tag == mapTag$6 || tag == setTag$6) {
      return !value.size;
    }
    if (_isPrototype(value)) {
      return !_baseKeys(value).length;
    }
    for (var key in value) {
      if (hasOwnProperty$d.call(value, key)) {
        return false;
      }
    }
    return true;
  }

  var isEmpty_1 = isEmpty;

  /**
   * Checks if `value` is `undefined`.
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is `undefined`, else `false`.
   * @example
   *
   * _.isUndefined(void 0);
   * // => true
   *
   * _.isUndefined(null);
   * // => false
   */
  function isUndefined(value) {
    return value === undefined;
  }

  var isUndefined_1 = isUndefined;

  /**
   * The base implementation of `_.map` without support for iteratee shorthands.
   *
   * @private
   * @param {Array|Object} collection The collection to iterate over.
   * @param {Function} iteratee The function invoked per iteration.
   * @returns {Array} Returns the new mapped array.
   */
  function baseMap(collection, iteratee) {
    var index = -1,
        result = isArrayLike_1(collection) ? Array(collection.length) : [];

    _baseEach(collection, function(value, key, collection) {
      result[++index] = iteratee(value, key, collection);
    });
    return result;
  }

  var _baseMap = baseMap;

  /**
   * Creates an array of values by running each element in `collection` thru
   * `iteratee`. The iteratee is invoked with three arguments:
   * (value, index|key, collection).
   *
   * Many lodash methods are guarded to work as iteratees for methods like
   * `_.every`, `_.filter`, `_.map`, `_.mapValues`, `_.reject`, and `_.some`.
   *
   * The guarded methods are:
   * `ary`, `chunk`, `curry`, `curryRight`, `drop`, `dropRight`, `every`,
   * `fill`, `invert`, `parseInt`, `random`, `range`, `rangeRight`, `repeat`,
   * `sampleSize`, `slice`, `some`, `sortBy`, `split`, `take`, `takeRight`,
   * `template`, `trim`, `trimEnd`, `trimStart`, and `words`
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Collection
   * @param {Array|Object} collection The collection to iterate over.
   * @param {Function} [iteratee=_.identity] The function invoked per iteration.
   * @returns {Array} Returns the new mapped array.
   * @example
   *
   * function square(n) {
   *   return n * n;
   * }
   *
   * _.map([4, 8], square);
   * // => [16, 64]
   *
   * _.map({ 'a': 4, 'b': 8 }, square);
   * // => [16, 64] (iteration order is not guaranteed)
   *
   * var users = [
   *   { 'user': 'barney' },
   *   { 'user': 'fred' }
   * ];
   *
   * // The `_.property` iteratee shorthand.
   * _.map(users, 'user');
   * // => ['barney', 'fred']
   */
  function map(collection, iteratee) {
    var func = isArray_1(collection) ? _arrayMap : _baseMap;
    return func(collection, _baseIteratee(iteratee));
  }

  var map_1 = map;

  /**
   * A specialized version of `_.reduce` for arrays without support for
   * iteratee shorthands.
   *
   * @private
   * @param {Array} [array] The array to iterate over.
   * @param {Function} iteratee The function invoked per iteration.
   * @param {*} [accumulator] The initial value.
   * @param {boolean} [initAccum] Specify using the first element of `array` as
   *  the initial value.
   * @returns {*} Returns the accumulated value.
   */
  function arrayReduce(array, iteratee, accumulator, initAccum) {
    var index = -1,
        length = array == null ? 0 : array.length;

    if (initAccum && length) {
      accumulator = array[++index];
    }
    while (++index < length) {
      accumulator = iteratee(accumulator, array[index], index, array);
    }
    return accumulator;
  }

  var _arrayReduce = arrayReduce;

  /**
   * The base implementation of `_.reduce` and `_.reduceRight`, without support
   * for iteratee shorthands, which iterates over `collection` using `eachFunc`.
   *
   * @private
   * @param {Array|Object} collection The collection to iterate over.
   * @param {Function} iteratee The function invoked per iteration.
   * @param {*} accumulator The initial value.
   * @param {boolean} initAccum Specify using the first or last element of
   *  `collection` as the initial value.
   * @param {Function} eachFunc The function to iterate over `collection`.
   * @returns {*} Returns the accumulated value.
   */
  function baseReduce(collection, iteratee, accumulator, initAccum, eachFunc) {
    eachFunc(collection, function(value, index, collection) {
      accumulator = initAccum
        ? (initAccum = false, value)
        : iteratee(accumulator, value, index, collection);
    });
    return accumulator;
  }

  var _baseReduce = baseReduce;

  /**
   * Reduces `collection` to a value which is the accumulated result of running
   * each element in `collection` thru `iteratee`, where each successive
   * invocation is supplied the return value of the previous. If `accumulator`
   * is not given, the first element of `collection` is used as the initial
   * value. The iteratee is invoked with four arguments:
   * (accumulator, value, index|key, collection).
   *
   * Many lodash methods are guarded to work as iteratees for methods like
   * `_.reduce`, `_.reduceRight`, and `_.transform`.
   *
   * The guarded methods are:
   * `assign`, `defaults`, `defaultsDeep`, `includes`, `merge`, `orderBy`,
   * and `sortBy`
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Collection
   * @param {Array|Object} collection The collection to iterate over.
   * @param {Function} [iteratee=_.identity] The function invoked per iteration.
   * @param {*} [accumulator] The initial value.
   * @returns {*} Returns the accumulated value.
   * @see _.reduceRight
   * @example
   *
   * _.reduce([1, 2], function(sum, n) {
   *   return sum + n;
   * }, 0);
   * // => 3
   *
   * _.reduce({ 'a': 1, 'b': 2, 'c': 1 }, function(result, value, key) {
   *   (result[value] || (result[value] = [])).push(key);
   *   return result;
   * }, {});
   * // => { '1': ['a', 'c'], '2': ['b'] } (iteration order is not guaranteed)
   */
  function reduce(collection, iteratee, accumulator) {
    var func = isArray_1(collection) ? _arrayReduce : _baseReduce,
        initAccum = arguments.length < 3;

    return func(collection, _baseIteratee(iteratee), accumulator, initAccum, _baseEach);
  }

  var reduce_1 = reduce;

  /** `Object#toString` result references. */
  var stringTag$4 = '[object String]';

  /**
   * Checks if `value` is classified as a `String` primitive or object.
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a string, else `false`.
   * @example
   *
   * _.isString('abc');
   * // => true
   *
   * _.isString(1);
   * // => false
   */
  function isString(value) {
    return typeof value == 'string' ||
      (!isArray_1(value) && isObjectLike_1(value) && _baseGetTag(value) == stringTag$4);
  }

  var isString_1 = isString;

  /**
   * Gets the size of an ASCII `string`.
   *
   * @private
   * @param {string} string The string inspect.
   * @returns {number} Returns the string size.
   */
  var asciiSize = _baseProperty('length');

  var _asciiSize = asciiSize;

  /** Used to compose unicode character classes. */
  var rsAstralRange = '\\ud800-\\udfff',
      rsComboMarksRange = '\\u0300-\\u036f',
      reComboHalfMarksRange = '\\ufe20-\\ufe2f',
      rsComboSymbolsRange = '\\u20d0-\\u20ff',
      rsComboRange = rsComboMarksRange + reComboHalfMarksRange + rsComboSymbolsRange,
      rsVarRange = '\\ufe0e\\ufe0f';

  /** Used to compose unicode capture groups. */
  var rsZWJ = '\\u200d';

  /** Used to detect strings with [zero-width joiners or code points from the astral planes](http://eev.ee/blog/2015/09/12/dark-corners-of-unicode/). */
  var reHasUnicode = RegExp('[' + rsZWJ + rsAstralRange  + rsComboRange + rsVarRange + ']');

  /**
   * Checks if `string` contains Unicode symbols.
   *
   * @private
   * @param {string} string The string to inspect.
   * @returns {boolean} Returns `true` if a symbol is found, else `false`.
   */
  function hasUnicode(string) {
    return reHasUnicode.test(string);
  }

  var _hasUnicode = hasUnicode;

  /** Used to compose unicode character classes. */
  var rsAstralRange$1 = '\\ud800-\\udfff',
      rsComboMarksRange$1 = '\\u0300-\\u036f',
      reComboHalfMarksRange$1 = '\\ufe20-\\ufe2f',
      rsComboSymbolsRange$1 = '\\u20d0-\\u20ff',
      rsComboRange$1 = rsComboMarksRange$1 + reComboHalfMarksRange$1 + rsComboSymbolsRange$1,
      rsVarRange$1 = '\\ufe0e\\ufe0f';

  /** Used to compose unicode capture groups. */
  var rsAstral = '[' + rsAstralRange$1 + ']',
      rsCombo = '[' + rsComboRange$1 + ']',
      rsFitz = '\\ud83c[\\udffb-\\udfff]',
      rsModifier = '(?:' + rsCombo + '|' + rsFitz + ')',
      rsNonAstral = '[^' + rsAstralRange$1 + ']',
      rsRegional = '(?:\\ud83c[\\udde6-\\uddff]){2}',
      rsSurrPair = '[\\ud800-\\udbff][\\udc00-\\udfff]',
      rsZWJ$1 = '\\u200d';

  /** Used to compose unicode regexes. */
  var reOptMod = rsModifier + '?',
      rsOptVar = '[' + rsVarRange$1 + ']?',
      rsOptJoin = '(?:' + rsZWJ$1 + '(?:' + [rsNonAstral, rsRegional, rsSurrPair].join('|') + ')' + rsOptVar + reOptMod + ')*',
      rsSeq = rsOptVar + reOptMod + rsOptJoin,
      rsSymbol = '(?:' + [rsNonAstral + rsCombo + '?', rsCombo, rsRegional, rsSurrPair, rsAstral].join('|') + ')';

  /** Used to match [string symbols](https://mathiasbynens.be/notes/javascript-unicode). */
  var reUnicode = RegExp(rsFitz + '(?=' + rsFitz + ')|' + rsSymbol + rsSeq, 'g');

  /**
   * Gets the size of a Unicode `string`.
   *
   * @private
   * @param {string} string The string inspect.
   * @returns {number} Returns the string size.
   */
  function unicodeSize(string) {
    var result = reUnicode.lastIndex = 0;
    while (reUnicode.test(string)) {
      ++result;
    }
    return result;
  }

  var _unicodeSize = unicodeSize;

  /**
   * Gets the number of symbols in `string`.
   *
   * @private
   * @param {string} string The string to inspect.
   * @returns {number} Returns the string size.
   */
  function stringSize(string) {
    return _hasUnicode(string)
      ? _unicodeSize(string)
      : _asciiSize(string);
  }

  var _stringSize = stringSize;

  /** `Object#toString` result references. */
  var mapTag$7 = '[object Map]',
      setTag$7 = '[object Set]';

  /**
   * Gets the size of `collection` by returning its length for array-like
   * values or the number of own enumerable string keyed properties for objects.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Collection
   * @param {Array|Object|string} collection The collection to inspect.
   * @returns {number} Returns the collection size.
   * @example
   *
   * _.size([1, 2, 3]);
   * // => 3
   *
   * _.size({ 'a': 1, 'b': 2 });
   * // => 2
   *
   * _.size('pebbles');
   * // => 7
   */
  function size(collection) {
    if (collection == null) {
      return 0;
    }
    if (isArrayLike_1(collection)) {
      return isString_1(collection) ? _stringSize(collection) : collection.length;
    }
    var tag = _getTag(collection);
    if (tag == mapTag$7 || tag == setTag$7) {
      return collection.size;
    }
    return _baseKeys(collection).length;
  }

  var size_1 = size;

  /**
   * An alternative to `_.reduce`; this method transforms `object` to a new
   * `accumulator` object which is the result of running each of its own
   * enumerable string keyed properties thru `iteratee`, with each invocation
   * potentially mutating the `accumulator` object. If `accumulator` is not
   * provided, a new object with the same `[[Prototype]]` will be used. The
   * iteratee is invoked with four arguments: (accumulator, value, key, object).
   * Iteratee functions may exit iteration early by explicitly returning `false`.
   *
   * @static
   * @memberOf _
   * @since 1.3.0
   * @category Object
   * @param {Object} object The object to iterate over.
   * @param {Function} [iteratee=_.identity] The function invoked per iteration.
   * @param {*} [accumulator] The custom accumulator value.
   * @returns {*} Returns the accumulated value.
   * @example
   *
   * _.transform([2, 3, 4], function(result, n) {
   *   result.push(n *= n);
   *   return n % 2 == 0;
   * }, []);
   * // => [4, 9]
   *
   * _.transform({ 'a': 1, 'b': 2, 'c': 1 }, function(result, value, key) {
   *   (result[value] || (result[value] = [])).push(key);
   * }, {});
   * // => { '1': ['a', 'c'], '2': ['b'] }
   */
  function transform(object, iteratee, accumulator) {
    var isArr = isArray_1(object),
        isArrLike = isArr || isBuffer_1(object) || isTypedArray_1(object);

    iteratee = _baseIteratee(iteratee);
    if (accumulator == null) {
      var Ctor = object && object.constructor;
      if (isArrLike) {
        accumulator = isArr ? new Ctor : [];
      }
      else if (isObject_1(object)) {
        accumulator = isFunction_1(Ctor) ? _baseCreate(_getPrototype(object)) : {};
      }
      else {
        accumulator = {};
      }
    }
    (isArrLike ? _arrayEach : _baseForOwn)(object, function(value, index, object) {
      return iteratee(accumulator, value, index, object);
    });
    return accumulator;
  }

  var transform_1 = transform;

  /** Built-in value references. */
  var spreadableSymbol = _Symbol ? _Symbol.isConcatSpreadable : undefined;

  /**
   * Checks if `value` is a flattenable `arguments` object or array.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is flattenable, else `false`.
   */
  function isFlattenable(value) {
    return isArray_1(value) || isArguments_1(value) ||
      !!(spreadableSymbol && value && value[spreadableSymbol]);
  }

  var _isFlattenable = isFlattenable;

  /**
   * The base implementation of `_.flatten` with support for restricting flattening.
   *
   * @private
   * @param {Array} array The array to flatten.
   * @param {number} depth The maximum recursion depth.
   * @param {boolean} [predicate=isFlattenable] The function invoked per iteration.
   * @param {boolean} [isStrict] Restrict to values that pass `predicate` checks.
   * @param {Array} [result=[]] The initial result value.
   * @returns {Array} Returns the new flattened array.
   */
  function baseFlatten(array, depth, predicate, isStrict, result) {
    var index = -1,
        length = array.length;

    predicate || (predicate = _isFlattenable);
    result || (result = []);

    while (++index < length) {
      var value = array[index];
      if (depth > 0 && predicate(value)) {
        if (depth > 1) {
          // Recursively flatten arrays (susceptible to call stack limits).
          baseFlatten(value, depth - 1, predicate, isStrict, result);
        } else {
          _arrayPush(result, value);
        }
      } else if (!isStrict) {
        result[result.length] = value;
      }
    }
    return result;
  }

  var _baseFlatten = baseFlatten;

  /**
   * A faster alternative to `Function#apply`, this function invokes `func`
   * with the `this` binding of `thisArg` and the arguments of `args`.
   *
   * @private
   * @param {Function} func The function to invoke.
   * @param {*} thisArg The `this` binding of `func`.
   * @param {Array} args The arguments to invoke `func` with.
   * @returns {*} Returns the result of `func`.
   */
  function apply(func, thisArg, args) {
    switch (args.length) {
      case 0: return func.call(thisArg);
      case 1: return func.call(thisArg, args[0]);
      case 2: return func.call(thisArg, args[0], args[1]);
      case 3: return func.call(thisArg, args[0], args[1], args[2]);
    }
    return func.apply(thisArg, args);
  }

  var _apply = apply;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeMax = Math.max;

  /**
   * A specialized version of `baseRest` which transforms the rest array.
   *
   * @private
   * @param {Function} func The function to apply a rest parameter to.
   * @param {number} [start=func.length-1] The start position of the rest parameter.
   * @param {Function} transform The rest array transform.
   * @returns {Function} Returns the new function.
   */
  function overRest(func, start, transform) {
    start = nativeMax(start === undefined ? (func.length - 1) : start, 0);
    return function() {
      var args = arguments,
          index = -1,
          length = nativeMax(args.length - start, 0),
          array = Array(length);

      while (++index < length) {
        array[index] = args[start + index];
      }
      index = -1;
      var otherArgs = Array(start + 1);
      while (++index < start) {
        otherArgs[index] = args[index];
      }
      otherArgs[start] = transform(array);
      return _apply(func, this, otherArgs);
    };
  }

  var _overRest = overRest;

  /**
   * The base implementation of `setToString` without support for hot loop shorting.
   *
   * @private
   * @param {Function} func The function to modify.
   * @param {Function} string The `toString` result.
   * @returns {Function} Returns `func`.
   */
  var baseSetToString = !_defineProperty ? identity_1 : function(func, string) {
    return _defineProperty(func, 'toString', {
      'configurable': true,
      'enumerable': false,
      'value': constant_1(string),
      'writable': true
    });
  };

  var _baseSetToString = baseSetToString;

  /** Used to detect hot functions by number of calls within a span of milliseconds. */
  var HOT_COUNT = 800,
      HOT_SPAN = 16;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeNow = Date.now;

  /**
   * Creates a function that'll short out and invoke `identity` instead
   * of `func` when it's called `HOT_COUNT` or more times in `HOT_SPAN`
   * milliseconds.
   *
   * @private
   * @param {Function} func The function to restrict.
   * @returns {Function} Returns the new shortable function.
   */
  function shortOut(func) {
    var count = 0,
        lastCalled = 0;

    return function() {
      var stamp = nativeNow(),
          remaining = HOT_SPAN - (stamp - lastCalled);

      lastCalled = stamp;
      if (remaining > 0) {
        if (++count >= HOT_COUNT) {
          return arguments[0];
        }
      } else {
        count = 0;
      }
      return func.apply(undefined, arguments);
    };
  }

  var _shortOut = shortOut;

  /**
   * Sets the `toString` method of `func` to return `string`.
   *
   * @private
   * @param {Function} func The function to modify.
   * @param {Function} string The `toString` result.
   * @returns {Function} Returns `func`.
   */
  var setToString = _shortOut(_baseSetToString);

  var _setToString = setToString;

  /**
   * The base implementation of `_.rest` which doesn't validate or coerce arguments.
   *
   * @private
   * @param {Function} func The function to apply a rest parameter to.
   * @param {number} [start=func.length-1] The start position of the rest parameter.
   * @returns {Function} Returns the new function.
   */
  function baseRest(func, start) {
    return _setToString(_overRest(func, start, identity_1), func + '');
  }

  var _baseRest = baseRest;

  /**
   * The base implementation of `_.findIndex` and `_.findLastIndex` without
   * support for iteratee shorthands.
   *
   * @private
   * @param {Array} array The array to inspect.
   * @param {Function} predicate The function invoked per iteration.
   * @param {number} fromIndex The index to search from.
   * @param {boolean} [fromRight] Specify iterating from right to left.
   * @returns {number} Returns the index of the matched value, else `-1`.
   */
  function baseFindIndex(array, predicate, fromIndex, fromRight) {
    var length = array.length,
        index = fromIndex + (fromRight ? 1 : -1);

    while ((fromRight ? index-- : ++index < length)) {
      if (predicate(array[index], index, array)) {
        return index;
      }
    }
    return -1;
  }

  var _baseFindIndex = baseFindIndex;

  /**
   * The base implementation of `_.isNaN` without support for number objects.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is `NaN`, else `false`.
   */
  function baseIsNaN(value) {
    return value !== value;
  }

  var _baseIsNaN = baseIsNaN;

  /**
   * A specialized version of `_.indexOf` which performs strict equality
   * comparisons of values, i.e. `===`.
   *
   * @private
   * @param {Array} array The array to inspect.
   * @param {*} value The value to search for.
   * @param {number} fromIndex The index to search from.
   * @returns {number} Returns the index of the matched value, else `-1`.
   */
  function strictIndexOf(array, value, fromIndex) {
    var index = fromIndex - 1,
        length = array.length;

    while (++index < length) {
      if (array[index] === value) {
        return index;
      }
    }
    return -1;
  }

  var _strictIndexOf = strictIndexOf;

  /**
   * The base implementation of `_.indexOf` without `fromIndex` bounds checks.
   *
   * @private
   * @param {Array} array The array to inspect.
   * @param {*} value The value to search for.
   * @param {number} fromIndex The index to search from.
   * @returns {number} Returns the index of the matched value, else `-1`.
   */
  function baseIndexOf(array, value, fromIndex) {
    return value === value
      ? _strictIndexOf(array, value, fromIndex)
      : _baseFindIndex(array, _baseIsNaN, fromIndex);
  }

  var _baseIndexOf = baseIndexOf;

  /**
   * A specialized version of `_.includes` for arrays without support for
   * specifying an index to search from.
   *
   * @private
   * @param {Array} [array] The array to inspect.
   * @param {*} target The value to search for.
   * @returns {boolean} Returns `true` if `target` is found, else `false`.
   */
  function arrayIncludes(array, value) {
    var length = array == null ? 0 : array.length;
    return !!length && _baseIndexOf(array, value, 0) > -1;
  }

  var _arrayIncludes = arrayIncludes;

  /**
   * This function is like `arrayIncludes` except that it accepts a comparator.
   *
   * @private
   * @param {Array} [array] The array to inspect.
   * @param {*} target The value to search for.
   * @param {Function} comparator The comparator invoked per element.
   * @returns {boolean} Returns `true` if `target` is found, else `false`.
   */
  function arrayIncludesWith(array, value, comparator) {
    var index = -1,
        length = array == null ? 0 : array.length;

    while (++index < length) {
      if (comparator(value, array[index])) {
        return true;
      }
    }
    return false;
  }

  var _arrayIncludesWith = arrayIncludesWith;

  /**
   * This method returns `undefined`.
   *
   * @static
   * @memberOf _
   * @since 2.3.0
   * @category Util
   * @example
   *
   * _.times(2, _.noop);
   * // => [undefined, undefined]
   */
  function noop() {
    // No operation performed.
  }

  var noop_1 = noop;

  /** Used as references for various `Number` constants. */
  var INFINITY$2 = 1 / 0;

  /**
   * Creates a set object of `values`.
   *
   * @private
   * @param {Array} values The values to add to the set.
   * @returns {Object} Returns the new set.
   */
  var createSet = !(_Set && (1 / _setToArray(new _Set([,-0]))[1]) == INFINITY$2) ? noop_1 : function(values) {
    return new _Set(values);
  };

  var _createSet = createSet;

  /** Used as the size to enable large array optimizations. */
  var LARGE_ARRAY_SIZE$1 = 200;

  /**
   * The base implementation of `_.uniqBy` without support for iteratee shorthands.
   *
   * @private
   * @param {Array} array The array to inspect.
   * @param {Function} [iteratee] The iteratee invoked per element.
   * @param {Function} [comparator] The comparator invoked per element.
   * @returns {Array} Returns the new duplicate free array.
   */
  function baseUniq(array, iteratee, comparator) {
    var index = -1,
        includes = _arrayIncludes,
        length = array.length,
        isCommon = true,
        result = [],
        seen = result;

    if (comparator) {
      isCommon = false;
      includes = _arrayIncludesWith;
    }
    else if (length >= LARGE_ARRAY_SIZE$1) {
      var set = iteratee ? null : _createSet(array);
      if (set) {
        return _setToArray(set);
      }
      isCommon = false;
      includes = _cacheHas;
      seen = new _SetCache;
    }
    else {
      seen = iteratee ? [] : result;
    }
    outer:
    while (++index < length) {
      var value = array[index],
          computed = iteratee ? iteratee(value) : value;

      value = (comparator || value !== 0) ? value : 0;
      if (isCommon && computed === computed) {
        var seenIndex = seen.length;
        while (seenIndex--) {
          if (seen[seenIndex] === computed) {
            continue outer;
          }
        }
        if (iteratee) {
          seen.push(computed);
        }
        result.push(value);
      }
      else if (!includes(seen, computed, comparator)) {
        if (seen !== result) {
          seen.push(computed);
        }
        result.push(value);
      }
    }
    return result;
  }

  var _baseUniq = baseUniq;

  /**
   * This method is like `_.isArrayLike` except that it also checks if `value`
   * is an object.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an array-like object,
   *  else `false`.
   * @example
   *
   * _.isArrayLikeObject([1, 2, 3]);
   * // => true
   *
   * _.isArrayLikeObject(document.body.children);
   * // => true
   *
   * _.isArrayLikeObject('abc');
   * // => false
   *
   * _.isArrayLikeObject(_.noop);
   * // => false
   */
  function isArrayLikeObject(value) {
    return isObjectLike_1(value) && isArrayLike_1(value);
  }

  var isArrayLikeObject_1 = isArrayLikeObject;

  /**
   * Creates an array of unique values, in order, from all given arrays using
   * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
   * for equality comparisons.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Array
   * @param {...Array} [arrays] The arrays to inspect.
   * @returns {Array} Returns the new array of combined values.
   * @example
   *
   * _.union([2], [1, 2]);
   * // => [2, 1]
   */
  var union = _baseRest(function(arrays) {
    return _baseUniq(_baseFlatten(arrays, 1, isArrayLikeObject_1, true));
  });

  var union_1 = union;

  /**
   * The base implementation of `_.values` and `_.valuesIn` which creates an
   * array of `object` property values corresponding to the property names
   * of `props`.
   *
   * @private
   * @param {Object} object The object to query.
   * @param {Array} props The property names to get values for.
   * @returns {Object} Returns the array of property values.
   */
  function baseValues(object, props) {
    return _arrayMap(props, function(key) {
      return object[key];
    });
  }

  var _baseValues = baseValues;

  /**
   * Creates an array of the own enumerable string keyed property values of `object`.
   *
   * **Note:** Non-object values are coerced to objects.
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category Object
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property values.
   * @example
   *
   * function Foo() {
   *   this.a = 1;
   *   this.b = 2;
   * }
   *
   * Foo.prototype.c = 3;
   *
   * _.values(new Foo);
   * // => [1, 2] (iteration order is not guaranteed)
   *
   * _.values('hi');
   * // => ['h', 'i']
   */
  function values(object) {
    return object == null ? [] : _baseValues(object, keys_1(object));
  }

  var values_1 = values;

  /* global window */

  var lodash;

  if (typeof commonjsRequire === "function") {
    try {
      lodash = {
        clone: clone_1,
        constant: constant_1,
        each: each,
        filter: filter_1,
        has:  has_1,
        isArray: isArray_1,
        isEmpty: isEmpty_1,
        isFunction: isFunction_1,
        isUndefined: isUndefined_1,
        keys: keys_1,
        map: map_1,
        reduce: reduce_1,
        size: size_1,
        transform: transform_1,
        union: union_1,
        values: values_1
      };
    } catch (e) {
      // continue regardless of error
    }
  }

  if (!lodash) {
    lodash = window._;
  }

  var lodash_1 = lodash;

  var graph = Graph;

  var DEFAULT_EDGE_NAME = "\x00";
  var GRAPH_NODE = "\x00";
  var EDGE_KEY_DELIM = "\x01";

  // Implementation notes:
  //
  //  * Node id query functions should return string ids for the nodes
  //  * Edge id query functions should return an "edgeObj", edge object, that is
  //    composed of enough information to uniquely identify an edge: {v, w, name}.
  //  * Internally we use an "edgeId", a stringified form of the edgeObj, to
  //    reference edges. This is because we need a performant way to look these
  //    edges up and, object properties, which have string keys, are the closest
  //    we're going to get to a performant hashtable in JavaScript.

  function Graph(opts) {
    this._isDirected = lodash_1.has(opts, "directed") ? opts.directed : true;
    this._isMultigraph = lodash_1.has(opts, "multigraph") ? opts.multigraph : false;
    this._isCompound = lodash_1.has(opts, "compound") ? opts.compound : false;

    // Label for the graph itself
    this._label = undefined;

    // Defaults to be set when creating a new node
    this._defaultNodeLabelFn = lodash_1.constant(undefined);

    // Defaults to be set when creating a new edge
    this._defaultEdgeLabelFn = lodash_1.constant(undefined);

    // v -> label
    this._nodes = {};

    if (this._isCompound) {
      // v -> parent
      this._parent = {};

      // v -> children
      this._children = {};
      this._children[GRAPH_NODE] = {};
    }

    // v -> edgeObj
    this._in = {};

    // u -> v -> Number
    this._preds = {};

    // v -> edgeObj
    this._out = {};

    // v -> w -> Number
    this._sucs = {};

    // e -> edgeObj
    this._edgeObjs = {};

    // e -> label
    this._edgeLabels = {};
  }

  /* Number of nodes in the graph. Should only be changed by the implementation. */
  Graph.prototype._nodeCount = 0;

  /* Number of edges in the graph. Should only be changed by the implementation. */
  Graph.prototype._edgeCount = 0;


  /* === Graph functions ========= */

  Graph.prototype.isDirected = function() {
    return this._isDirected;
  };

  Graph.prototype.isMultigraph = function() {
    return this._isMultigraph;
  };

  Graph.prototype.isCompound = function() {
    return this._isCompound;
  };

  Graph.prototype.setGraph = function(label) {
    this._label = label;
    return this;
  };

  Graph.prototype.graph = function() {
    return this._label;
  };


  /* === Node functions ========== */

  Graph.prototype.setDefaultNodeLabel = function(newDefault) {
    if (!lodash_1.isFunction(newDefault)) {
      newDefault = lodash_1.constant(newDefault);
    }
    this._defaultNodeLabelFn = newDefault;
    return this;
  };

  Graph.prototype.nodeCount = function() {
    return this._nodeCount;
  };

  Graph.prototype.nodes = function() {
    return lodash_1.keys(this._nodes);
  };

  Graph.prototype.sources = function() {
    var self = this;
    return lodash_1.filter(this.nodes(), function(v) {
      return lodash_1.isEmpty(self._in[v]);
    });
  };

  Graph.prototype.sinks = function() {
    var self = this;
    return lodash_1.filter(this.nodes(), function(v) {
      return lodash_1.isEmpty(self._out[v]);
    });
  };

  Graph.prototype.setNodes = function(vs, value) {
    var args = arguments;
    var self = this;
    lodash_1.each(vs, function(v) {
      if (args.length > 1) {
        self.setNode(v, value);
      } else {
        self.setNode(v);
      }
    });
    return this;
  };

  Graph.prototype.setNode = function(v, value) {
    if (lodash_1.has(this._nodes, v)) {
      if (arguments.length > 1) {
        this._nodes[v] = value;
      }
      return this;
    }

    this._nodes[v] = arguments.length > 1 ? value : this._defaultNodeLabelFn(v);
    if (this._isCompound) {
      this._parent[v] = GRAPH_NODE;
      this._children[v] = {};
      this._children[GRAPH_NODE][v] = true;
    }
    this._in[v] = {};
    this._preds[v] = {};
    this._out[v] = {};
    this._sucs[v] = {};
    ++this._nodeCount;
    return this;
  };

  Graph.prototype.node = function(v) {
    return this._nodes[v];
  };

  Graph.prototype.hasNode = function(v) {
    return lodash_1.has(this._nodes, v);
  };

  Graph.prototype.removeNode =  function(v) {
    var self = this;
    if (lodash_1.has(this._nodes, v)) {
      var removeEdge = function(e) { self.removeEdge(self._edgeObjs[e]); };
      delete this._nodes[v];
      if (this._isCompound) {
        this._removeFromParentsChildList(v);
        delete this._parent[v];
        lodash_1.each(this.children(v), function(child) {
          self.setParent(child);
        });
        delete this._children[v];
      }
      lodash_1.each(lodash_1.keys(this._in[v]), removeEdge);
      delete this._in[v];
      delete this._preds[v];
      lodash_1.each(lodash_1.keys(this._out[v]), removeEdge);
      delete this._out[v];
      delete this._sucs[v];
      --this._nodeCount;
    }
    return this;
  };

  Graph.prototype.setParent = function(v, parent) {
    if (!this._isCompound) {
      throw new Error("Cannot set parent in a non-compound graph");
    }

    if (lodash_1.isUndefined(parent)) {
      parent = GRAPH_NODE;
    } else {
      // Coerce parent to string
      parent += "";
      for (var ancestor = parent;
        !lodash_1.isUndefined(ancestor);
        ancestor = this.parent(ancestor)) {
        if (ancestor === v) {
          throw new Error("Setting " + parent+ " as parent of " + v +
                          " would create a cycle");
        }
      }

      this.setNode(parent);
    }

    this.setNode(v);
    this._removeFromParentsChildList(v);
    this._parent[v] = parent;
    this._children[parent][v] = true;
    return this;
  };

  Graph.prototype._removeFromParentsChildList = function(v) {
    delete this._children[this._parent[v]][v];
  };

  Graph.prototype.parent = function(v) {
    if (this._isCompound) {
      var parent = this._parent[v];
      if (parent !== GRAPH_NODE) {
        return parent;
      }
    }
  };

  Graph.prototype.children = function(v) {
    if (lodash_1.isUndefined(v)) {
      v = GRAPH_NODE;
    }

    if (this._isCompound) {
      var children = this._children[v];
      if (children) {
        return lodash_1.keys(children);
      }
    } else if (v === GRAPH_NODE) {
      return this.nodes();
    } else if (this.hasNode(v)) {
      return [];
    }
  };

  Graph.prototype.predecessors = function(v) {
    var predsV = this._preds[v];
    if (predsV) {
      return lodash_1.keys(predsV);
    }
  };

  Graph.prototype.successors = function(v) {
    var sucsV = this._sucs[v];
    if (sucsV) {
      return lodash_1.keys(sucsV);
    }
  };

  Graph.prototype.neighbors = function(v) {
    var preds = this.predecessors(v);
    if (preds) {
      return lodash_1.union(preds, this.successors(v));
    }
  };

  Graph.prototype.isLeaf = function (v) {
    var neighbors;
    if (this.isDirected()) {
      neighbors = this.successors(v);
    } else {
      neighbors = this.neighbors(v);
    }
    return neighbors.length === 0;
  };

  Graph.prototype.filterNodes = function(filter) {
    var copy = new this.constructor({
      directed: this._isDirected,
      multigraph: this._isMultigraph,
      compound: this._isCompound
    });

    copy.setGraph(this.graph());

    var self = this;
    lodash_1.each(this._nodes, function(value, v) {
      if (filter(v)) {
        copy.setNode(v, value);
      }
    });

    lodash_1.each(this._edgeObjs, function(e) {
      if (copy.hasNode(e.v) && copy.hasNode(e.w)) {
        copy.setEdge(e, self.edge(e));
      }
    });

    var parents = {};
    function findParent(v) {
      var parent = self.parent(v);
      if (parent === undefined || copy.hasNode(parent)) {
        parents[v] = parent;
        return parent;
      } else if (parent in parents) {
        return parents[parent];
      } else {
        return findParent(parent);
      }
    }

    if (this._isCompound) {
      lodash_1.each(copy.nodes(), function(v) {
        copy.setParent(v, findParent(v));
      });
    }

    return copy;
  };

  /* === Edge functions ========== */

  Graph.prototype.setDefaultEdgeLabel = function(newDefault) {
    if (!lodash_1.isFunction(newDefault)) {
      newDefault = lodash_1.constant(newDefault);
    }
    this._defaultEdgeLabelFn = newDefault;
    return this;
  };

  Graph.prototype.edgeCount = function() {
    return this._edgeCount;
  };

  Graph.prototype.edges = function() {
    return lodash_1.values(this._edgeObjs);
  };

  Graph.prototype.setPath = function(vs, value) {
    var self = this;
    var args = arguments;
    lodash_1.reduce(vs, function(v, w) {
      if (args.length > 1) {
        self.setEdge(v, w, value);
      } else {
        self.setEdge(v, w);
      }
      return w;
    });
    return this;
  };

  /*
   * setEdge(v, w, [value, [name]])
   * setEdge({ v, w, [name] }, [value])
   */
  Graph.prototype.setEdge = function() {
    var v, w, name, value;
    var valueSpecified = false;
    var arg0 = arguments[0];

    if (typeof arg0 === "object" && arg0 !== null && "v" in arg0) {
      v = arg0.v;
      w = arg0.w;
      name = arg0.name;
      if (arguments.length === 2) {
        value = arguments[1];
        valueSpecified = true;
      }
    } else {
      v = arg0;
      w = arguments[1];
      name = arguments[3];
      if (arguments.length > 2) {
        value = arguments[2];
        valueSpecified = true;
      }
    }

    v = "" + v;
    w = "" + w;
    if (!lodash_1.isUndefined(name)) {
      name = "" + name;
    }

    var e = edgeArgsToId(this._isDirected, v, w, name);
    if (lodash_1.has(this._edgeLabels, e)) {
      if (valueSpecified) {
        this._edgeLabels[e] = value;
      }
      return this;
    }

    if (!lodash_1.isUndefined(name) && !this._isMultigraph) {
      throw new Error("Cannot set a named edge when isMultigraph = false");
    }

    // It didn't exist, so we need to create it.
    // First ensure the nodes exist.
    this.setNode(v);
    this.setNode(w);

    this._edgeLabels[e] = valueSpecified ? value : this._defaultEdgeLabelFn(v, w, name);

    var edgeObj = edgeArgsToObj(this._isDirected, v, w, name);
    // Ensure we add undirected edges in a consistent way.
    v = edgeObj.v;
    w = edgeObj.w;

    Object.freeze(edgeObj);
    this._edgeObjs[e] = edgeObj;
    incrementOrInitEntry(this._preds[w], v);
    incrementOrInitEntry(this._sucs[v], w);
    this._in[w][e] = edgeObj;
    this._out[v][e] = edgeObj;
    this._edgeCount++;
    return this;
  };

  Graph.prototype.edge = function(v, w, name) {
    var e = (arguments.length === 1
      ? edgeObjToId(this._isDirected, arguments[0])
      : edgeArgsToId(this._isDirected, v, w, name));
    return this._edgeLabels[e];
  };

  Graph.prototype.hasEdge = function(v, w, name) {
    var e = (arguments.length === 1
      ? edgeObjToId(this._isDirected, arguments[0])
      : edgeArgsToId(this._isDirected, v, w, name));
    return lodash_1.has(this._edgeLabels, e);
  };

  Graph.prototype.removeEdge = function(v, w, name) {
    var e = (arguments.length === 1
      ? edgeObjToId(this._isDirected, arguments[0])
      : edgeArgsToId(this._isDirected, v, w, name));
    var edge = this._edgeObjs[e];
    if (edge) {
      v = edge.v;
      w = edge.w;
      delete this._edgeLabels[e];
      delete this._edgeObjs[e];
      decrementOrRemoveEntry(this._preds[w], v);
      decrementOrRemoveEntry(this._sucs[v], w);
      delete this._in[w][e];
      delete this._out[v][e];
      this._edgeCount--;
    }
    return this;
  };

  Graph.prototype.inEdges = function(v, u) {
    var inV = this._in[v];
    if (inV) {
      var edges = lodash_1.values(inV);
      if (!u) {
        return edges;
      }
      return lodash_1.filter(edges, function(edge) { return edge.v === u; });
    }
  };

  Graph.prototype.outEdges = function(v, w) {
    var outV = this._out[v];
    if (outV) {
      var edges = lodash_1.values(outV);
      if (!w) {
        return edges;
      }
      return lodash_1.filter(edges, function(edge) { return edge.w === w; });
    }
  };

  Graph.prototype.nodeEdges = function(v, w) {
    var inEdges = this.inEdges(v, w);
    if (inEdges) {
      return inEdges.concat(this.outEdges(v, w));
    }
  };

  function incrementOrInitEntry(map, k) {
    if (map[k]) {
      map[k]++;
    } else {
      map[k] = 1;
    }
  }

  function decrementOrRemoveEntry(map, k) {
    if (!--map[k]) { delete map[k]; }
  }

  function edgeArgsToId(isDirected, v_, w_, name) {
    var v = "" + v_;
    var w = "" + w_;
    if (!isDirected && v > w) {
      var tmp = v;
      v = w;
      w = tmp;
    }
    return v + EDGE_KEY_DELIM + w + EDGE_KEY_DELIM +
               (lodash_1.isUndefined(name) ? DEFAULT_EDGE_NAME : name);
  }

  function edgeArgsToObj(isDirected, v_, w_, name) {
    var v = "" + v_;
    var w = "" + w_;
    if (!isDirected && v > w) {
      var tmp = v;
      v = w;
      w = tmp;
    }
    var edgeObj =  { v: v, w: w };
    if (name) {
      edgeObj.name = name;
    }
    return edgeObj;
  }

  function edgeObjToId(isDirected, edgeObj) {
    return edgeArgsToId(isDirected, edgeObj.v, edgeObj.w, edgeObj.name);
  }

  var version$1 = '2.1.8';

  // Includes only the "core" of graphlib
  var lib = {
    Graph: graph,
    version: version$1
  };

  var json = {
    write: write,
    read: read
  };

  function write(g) {
    var json = {
      options: {
        directed: g.isDirected(),
        multigraph: g.isMultigraph(),
        compound: g.isCompound()
      },
      nodes: writeNodes(g),
      edges: writeEdges(g)
    };
    if (!lodash_1.isUndefined(g.graph())) {
      json.value = lodash_1.clone(g.graph());
    }
    return json;
  }

  function writeNodes(g) {
    return lodash_1.map(g.nodes(), function(v) {
      var nodeValue = g.node(v);
      var parent = g.parent(v);
      var node = { v: v };
      if (!lodash_1.isUndefined(nodeValue)) {
        node.value = nodeValue;
      }
      if (!lodash_1.isUndefined(parent)) {
        node.parent = parent;
      }
      return node;
    });
  }

  function writeEdges(g) {
    return lodash_1.map(g.edges(), function(e) {
      var edgeValue = g.edge(e);
      var edge = { v: e.v, w: e.w };
      if (!lodash_1.isUndefined(e.name)) {
        edge.name = e.name;
      }
      if (!lodash_1.isUndefined(edgeValue)) {
        edge.value = edgeValue;
      }
      return edge;
    });
  }

  function read(json) {
    var g = new graph(json.options).setGraph(json.value);
    lodash_1.each(json.nodes, function(entry) {
      g.setNode(entry.v, entry.value);
      if (entry.parent) {
        g.setParent(entry.v, entry.parent);
      }
    });
    lodash_1.each(json.edges, function(entry) {
      g.setEdge({ v: entry.v, w: entry.w, name: entry.name }, entry.value);
    });
    return g;
  }

  var components_1 = components;

  function components(g) {
    var visited = {};
    var cmpts = [];
    var cmpt;

    function dfs(v) {
      if (lodash_1.has(visited, v)) return;
      visited[v] = true;
      cmpt.push(v);
      lodash_1.each(g.successors(v), dfs);
      lodash_1.each(g.predecessors(v), dfs);
    }

    lodash_1.each(g.nodes(), function(v) {
      cmpt = [];
      dfs(v);
      if (cmpt.length) {
        cmpts.push(cmpt);
      }
    });

    return cmpts;
  }

  var priorityQueue = PriorityQueue;

  /**
   * A min-priority queue data structure. This algorithm is derived from Cormen,
   * et al., "Introduction to Algorithms". The basic idea of a min-priority
   * queue is that you can efficiently (in O(1) time) get the smallest key in
   * the queue. Adding and removing elements takes O(log n) time. A key can
   * have its priority decreased in O(log n) time.
   */
  function PriorityQueue() {
    this._arr = [];
    this._keyIndices = {};
  }

  /**
   * Returns the number of elements in the queue. Takes `O(1)` time.
   */
  PriorityQueue.prototype.size = function() {
    return this._arr.length;
  };

  /**
   * Returns the keys that are in the queue. Takes `O(n)` time.
   */
  PriorityQueue.prototype.keys = function() {
    return this._arr.map(function(x) { return x.key; });
  };

  /**
   * Returns `true` if **key** is in the queue and `false` if not.
   */
  PriorityQueue.prototype.has = function(key) {
    return lodash_1.has(this._keyIndices, key);
  };

  /**
   * Returns the priority for **key**. If **key** is not present in the queue
   * then this function returns `undefined`. Takes `O(1)` time.
   *
   * @param {Object} key
   */
  PriorityQueue.prototype.priority = function(key) {
    var index = this._keyIndices[key];
    if (index !== undefined) {
      return this._arr[index].priority;
    }
  };

  /**
   * Returns the key for the minimum element in this queue. If the queue is
   * empty this function throws an Error. Takes `O(1)` time.
   */
  PriorityQueue.prototype.min = function() {
    if (this.size() === 0) {
      throw new Error("Queue underflow");
    }
    return this._arr[0].key;
  };

  /**
   * Inserts a new key into the priority queue. If the key already exists in
   * the queue this function returns `false`; otherwise it will return `true`.
   * Takes `O(n)` time.
   *
   * @param {Object} key the key to add
   * @param {Number} priority the initial priority for the key
   */
  PriorityQueue.prototype.add = function(key, priority) {
    var keyIndices = this._keyIndices;
    key = String(key);
    if (!lodash_1.has(keyIndices, key)) {
      var arr = this._arr;
      var index = arr.length;
      keyIndices[key] = index;
      arr.push({key: key, priority: priority});
      this._decrease(index);
      return true;
    }
    return false;
  };

  /**
   * Removes and returns the smallest key in the queue. Takes `O(log n)` time.
   */
  PriorityQueue.prototype.removeMin = function() {
    this._swap(0, this._arr.length - 1);
    var min = this._arr.pop();
    delete this._keyIndices[min.key];
    this._heapify(0);
    return min.key;
  };

  /**
   * Decreases the priority for **key** to **priority**. If the new priority is
   * greater than the previous priority, this function will throw an Error.
   *
   * @param {Object} key the key for which to raise priority
   * @param {Number} priority the new priority for the key
   */
  PriorityQueue.prototype.decrease = function(key, priority) {
    var index = this._keyIndices[key];
    if (priority > this._arr[index].priority) {
      throw new Error("New priority is greater than current priority. " +
          "Key: " + key + " Old: " + this._arr[index].priority + " New: " + priority);
    }
    this._arr[index].priority = priority;
    this._decrease(index);
  };

  PriorityQueue.prototype._heapify = function(i) {
    var arr = this._arr;
    var l = 2 * i;
    var r = l + 1;
    var largest = i;
    if (l < arr.length) {
      largest = arr[l].priority < arr[largest].priority ? l : largest;
      if (r < arr.length) {
        largest = arr[r].priority < arr[largest].priority ? r : largest;
      }
      if (largest !== i) {
        this._swap(i, largest);
        this._heapify(largest);
      }
    }
  };

  PriorityQueue.prototype._decrease = function(index) {
    var arr = this._arr;
    var priority = arr[index].priority;
    var parent;
    while (index !== 0) {
      parent = index >> 1;
      if (arr[parent].priority < priority) {
        break;
      }
      this._swap(index, parent);
      index = parent;
    }
  };

  PriorityQueue.prototype._swap = function(i, j) {
    var arr = this._arr;
    var keyIndices = this._keyIndices;
    var origArrI = arr[i];
    var origArrJ = arr[j];
    arr[i] = origArrJ;
    arr[j] = origArrI;
    keyIndices[origArrJ.key] = i;
    keyIndices[origArrI.key] = j;
  };

  var dijkstra_1 = dijkstra;

  var DEFAULT_WEIGHT_FUNC = lodash_1.constant(1);

  function dijkstra(g, source, weightFn, edgeFn) {
    return runDijkstra(g, String(source),
      weightFn || DEFAULT_WEIGHT_FUNC,
      edgeFn || function(v) { return g.outEdges(v); });
  }

  function runDijkstra(g, source, weightFn, edgeFn) {
    var results = {};
    var pq = new priorityQueue();
    var v, vEntry;

    var updateNeighbors = function(edge) {
      var w = edge.v !== v ? edge.v : edge.w;
      var wEntry = results[w];
      var weight = weightFn(edge);
      var distance = vEntry.distance + weight;

      if (weight < 0) {
        throw new Error("dijkstra does not allow negative edge weights. " +
                        "Bad edge: " + edge + " Weight: " + weight);
      }

      if (distance < wEntry.distance) {
        wEntry.distance = distance;
        wEntry.predecessor = v;
        pq.decrease(w, distance);
      }
    };

    g.nodes().forEach(function(v) {
      var distance = v === source ? 0 : Number.POSITIVE_INFINITY;
      results[v] = { distance: distance };
      pq.add(v, distance);
    });

    while (pq.size() > 0) {
      v = pq.removeMin();
      vEntry = results[v];
      if (vEntry.distance === Number.POSITIVE_INFINITY) {
        break;
      }

      edgeFn(v).forEach(updateNeighbors);
    }

    return results;
  }

  var dijkstraAll_1 = dijkstraAll;

  function dijkstraAll(g, weightFunc, edgeFunc) {
    return lodash_1.transform(g.nodes(), function(acc, v) {
      acc[v] = dijkstra_1(g, v, weightFunc, edgeFunc);
    }, {});
  }

  var tarjan_1 = tarjan;

  function tarjan(g) {
    var index = 0;
    var stack = [];
    var visited = {}; // node id -> { onStack, lowlink, index }
    var results = [];

    function dfs(v) {
      var entry = visited[v] = {
        onStack: true,
        lowlink: index,
        index: index++
      };
      stack.push(v);

      g.successors(v).forEach(function(w) {
        if (!lodash_1.has(visited, w)) {
          dfs(w);
          entry.lowlink = Math.min(entry.lowlink, visited[w].lowlink);
        } else if (visited[w].onStack) {
          entry.lowlink = Math.min(entry.lowlink, visited[w].index);
        }
      });

      if (entry.lowlink === entry.index) {
        var cmpt = [];
        var w;
        do {
          w = stack.pop();
          visited[w].onStack = false;
          cmpt.push(w);
        } while (v !== w);
        results.push(cmpt);
      }
    }

    g.nodes().forEach(function(v) {
      if (!lodash_1.has(visited, v)) {
        dfs(v);
      }
    });

    return results;
  }

  var findCycles_1 = findCycles;

  function findCycles(g) {
    return lodash_1.filter(tarjan_1(g), function(cmpt) {
      return cmpt.length > 1 || (cmpt.length === 1 && g.hasEdge(cmpt[0], cmpt[0]));
    });
  }

  var floydWarshall_1 = floydWarshall;

  var DEFAULT_WEIGHT_FUNC$1 = lodash_1.constant(1);

  function floydWarshall(g, weightFn, edgeFn) {
    return runFloydWarshall(g,
      weightFn || DEFAULT_WEIGHT_FUNC$1,
      edgeFn || function(v) { return g.outEdges(v); });
  }

  function runFloydWarshall(g, weightFn, edgeFn) {
    var results = {};
    var nodes = g.nodes();

    nodes.forEach(function(v) {
      results[v] = {};
      results[v][v] = { distance: 0 };
      nodes.forEach(function(w) {
        if (v !== w) {
          results[v][w] = { distance: Number.POSITIVE_INFINITY };
        }
      });
      edgeFn(v).forEach(function(edge) {
        var w = edge.v === v ? edge.w : edge.v;
        var d = weightFn(edge);
        results[v][w] = { distance: d, predecessor: v };
      });
    });

    nodes.forEach(function(k) {
      var rowK = results[k];
      nodes.forEach(function(i) {
        var rowI = results[i];
        nodes.forEach(function(j) {
          var ik = rowI[k];
          var kj = rowK[j];
          var ij = rowI[j];
          var altDistance = ik.distance + kj.distance;
          if (altDistance < ij.distance) {
            ij.distance = altDistance;
            ij.predecessor = kj.predecessor;
          }
        });
      });
    });

    return results;
  }

  var topsort_1 = topsort;
  topsort.CycleException = CycleException;

  function topsort(g) {
    var visited = {};
    var stack = {};
    var results = [];

    function visit(node) {
      if (lodash_1.has(stack, node)) {
        throw new CycleException();
      }

      if (!lodash_1.has(visited, node)) {
        stack[node] = true;
        visited[node] = true;
        lodash_1.each(g.predecessors(node), visit);
        delete stack[node];
        results.push(node);
      }
    }

    lodash_1.each(g.sinks(), visit);

    if (lodash_1.size(visited) !== g.nodeCount()) {
      throw new CycleException();
    }

    return results;
  }

  function CycleException() {}
  CycleException.prototype = new Error(); // must be an instance of Error to pass testing

  var isAcyclic_1 = isAcyclic;

  function isAcyclic(g) {
    try {
      topsort_1(g);
    } catch (e) {
      if (e instanceof topsort_1.CycleException) {
        return false;
      }
      throw e;
    }
    return true;
  }

  var dfs_1 = dfs;

  /*
   * A helper that preforms a pre- or post-order traversal on the input graph
   * and returns the nodes in the order they were visited. If the graph is
   * undirected then this algorithm will navigate using neighbors. If the graph
   * is directed then this algorithm will navigate using successors.
   *
   * Order must be one of "pre" or "post".
   */
  function dfs(g, vs, order) {
    if (!lodash_1.isArray(vs)) {
      vs = [vs];
    }

    var navigation = (g.isDirected() ? g.successors : g.neighbors).bind(g);

    var acc = [];
    var visited = {};
    lodash_1.each(vs, function(v) {
      if (!g.hasNode(v)) {
        throw new Error("Graph does not have node: " + v);
      }

      doDfs(g, v, order === "post", visited, navigation, acc);
    });
    return acc;
  }

  function doDfs(g, v, postorder, visited, navigation, acc) {
    if (!lodash_1.has(visited, v)) {
      visited[v] = true;

      if (!postorder) { acc.push(v); }
      lodash_1.each(navigation(v), function(w) {
        doDfs(g, w, postorder, visited, navigation, acc);
      });
      if (postorder) { acc.push(v); }
    }
  }

  var postorder_1 = postorder;

  function postorder(g, vs) {
    return dfs_1(g, vs, "post");
  }

  var preorder_1 = preorder;

  function preorder(g, vs) {
    return dfs_1(g, vs, "pre");
  }

  var prim_1 = prim;

  function prim(g, weightFunc) {
    var result = new graph();
    var parents = {};
    var pq = new priorityQueue();
    var v;

    function updateNeighbors(edge) {
      var w = edge.v === v ? edge.w : edge.v;
      var pri = pq.priority(w);
      if (pri !== undefined) {
        var edgeWeight = weightFunc(edge);
        if (edgeWeight < pri) {
          parents[w] = v;
          pq.decrease(w, edgeWeight);
        }
      }
    }

    if (g.nodeCount() === 0) {
      return result;
    }

    lodash_1.each(g.nodes(), function(v) {
      pq.add(v, Number.POSITIVE_INFINITY);
      result.setNode(v);
    });

    // Start from an arbitrary node
    pq.decrease(g.nodes()[0], 0);

    var init = false;
    while (pq.size() > 0) {
      v = pq.removeMin();
      if (lodash_1.has(parents, v)) {
        result.setEdge(v, parents[v]);
      } else if (init) {
        throw new Error("Input graph is not connected: " + g);
      } else {
        init = true;
      }

      g.nodeEdges(v).forEach(updateNeighbors);
    }

    return result;
  }

  var alg = {
    components: components_1,
    dijkstra: dijkstra_1,
    dijkstraAll: dijkstraAll_1,
    findCycles: findCycles_1,
    floydWarshall: floydWarshall_1,
    isAcyclic: isAcyclic_1,
    postorder: postorder_1,
    preorder: preorder_1,
    prim: prim_1,
    tarjan: tarjan_1,
    topsort: topsort_1
  };

  /**
   * Copyright (c) 2014, Chris Pettitt
   * All rights reserved.
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice, this
   * list of conditions and the following disclaimer.
   *
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   * this list of conditions and the following disclaimer in the documentation
   * and/or other materials provided with the distribution.
   *
   * 3. Neither the name of the copyright holder nor the names of its contributors
   * may be used to endorse or promote products derived from this software without
   * specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
   * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
   * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
   * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
   * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
   * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
   * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
   * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   */



  var graphlib = {
    Graph: lib.Graph,
    json: json,
    alg: alg,
    version: lib.version
  };
  var graphlib_1 = graphlib.Graph;
  var graphlib_3 = graphlib.alg;

  /*
   * anime.js v3.2.0
   * (c) 2020 Julian Garnier
   * Released under the MIT license
   * animejs.com
   */

  // Defaults

  var defaultInstanceSettings = {
    update: null,
    begin: null,
    loopBegin: null,
    changeBegin: null,
    change: null,
    changeComplete: null,
    loopComplete: null,
    complete: null,
    loop: 1,
    direction: 'normal',
    autoplay: true,
    timelineOffset: 0
  };

  var defaultTweenSettings = {
    duration: 1000,
    delay: 0,
    endDelay: 0,
    easing: 'easeOutElastic(1, .5)',
    round: 0
  };

  var validTransforms = ['translateX', 'translateY', 'translateZ', 'rotate', 'rotateX', 'rotateY', 'rotateZ', 'scale', 'scaleX', 'scaleY', 'scaleZ', 'skew', 'skewX', 'skewY', 'perspective', 'matrix', 'matrix3d'];

  // Caching

  var cache = {
    CSS: {},
    springs: {}
  };

  // Utils

  function minMax(val, min, max) {
    return Math.min(Math.max(val, min), max);
  }

  function stringContains(str, text) {
    return str.indexOf(text) > -1;
  }

  function applyArguments(func, args) {
    return func.apply(null, args);
  }

  var is = {
    arr: function (a) { return Array.isArray(a); },
    obj: function (a) { return stringContains(Object.prototype.toString.call(a), 'Object'); },
    pth: function (a) { return is.obj(a) && a.hasOwnProperty('totalLength'); },
    svg: function (a) { return a instanceof SVGElement; },
    inp: function (a) { return a instanceof HTMLInputElement; },
    dom: function (a) { return a.nodeType || is.svg(a); },
    str: function (a) { return typeof a === 'string'; },
    fnc: function (a) { return typeof a === 'function'; },
    und: function (a) { return typeof a === 'undefined'; },
    hex: function (a) { return /(^#[0-9A-F]{6}$)|(^#[0-9A-F]{3}$)/i.test(a); },
    rgb: function (a) { return /^rgb/.test(a); },
    hsl: function (a) { return /^hsl/.test(a); },
    col: function (a) { return (is.hex(a) || is.rgb(a) || is.hsl(a)); },
    key: function (a) { return !defaultInstanceSettings.hasOwnProperty(a) && !defaultTweenSettings.hasOwnProperty(a) && a !== 'targets' && a !== 'keyframes'; }
  };

  // Easings

  function parseEasingParameters(string) {
    var match = /\(([^)]+)\)/.exec(string);
    return match ? match[1].split(',').map(function (p) { return parseFloat(p); }) : [];
  }

  // Spring solver inspired by Webkit Copyright © 2016 Apple Inc. All rights reserved. https://webkit.org/demos/spring/spring.js

  function spring(string, duration) {

    var params = parseEasingParameters(string);
    var mass = minMax(is.und(params[0]) ? 1 : params[0], .1, 100);
    var stiffness = minMax(is.und(params[1]) ? 100 : params[1], .1, 100);
    var damping = minMax(is.und(params[2]) ? 10 : params[2], .1, 100);
    var velocity =  minMax(is.und(params[3]) ? 0 : params[3], .1, 100);
    var w0 = Math.sqrt(stiffness / mass);
    var zeta = damping / (2 * Math.sqrt(stiffness * mass));
    var wd = zeta < 1 ? w0 * Math.sqrt(1 - zeta * zeta) : 0;
    var a = 1;
    var b = zeta < 1 ? (zeta * w0 + -velocity) / wd : -velocity + w0;

    function solver(t) {
      var progress = duration ? (duration * t) / 1000 : t;
      if (zeta < 1) {
        progress = Math.exp(-progress * zeta * w0) * (a * Math.cos(wd * progress) + b * Math.sin(wd * progress));
      } else {
        progress = (a + b * progress) * Math.exp(-progress * w0);
      }
      if (t === 0 || t === 1) { return t; }
      return 1 - progress;
    }

    function getDuration() {
      var cached = cache.springs[string];
      if (cached) { return cached; }
      var frame = 1/6;
      var elapsed = 0;
      var rest = 0;
      while(true) {
        elapsed += frame;
        if (solver(elapsed) === 1) {
          rest++;
          if (rest >= 16) { break; }
        } else {
          rest = 0;
        }
      }
      var duration = elapsed * frame * 1000;
      cache.springs[string] = duration;
      return duration;
    }

    return duration ? solver : getDuration;

  }

  // Basic steps easing implementation https://developer.mozilla.org/fr/docs/Web/CSS/transition-timing-function

  function steps(steps) {
    if ( steps === void 0 ) steps = 10;

    return function (t) { return Math.ceil((minMax(t, 0.000001, 1)) * steps) * (1 / steps); };
  }

  // BezierEasing https://github.com/gre/bezier-easing

  var bezier = (function () {

    var kSplineTableSize = 11;
    var kSampleStepSize = 1.0 / (kSplineTableSize - 1.0);

    function A(aA1, aA2) { return 1.0 - 3.0 * aA2 + 3.0 * aA1 }
    function B(aA1, aA2) { return 3.0 * aA2 - 6.0 * aA1 }
    function C(aA1)      { return 3.0 * aA1 }

    function calcBezier(aT, aA1, aA2) { return ((A(aA1, aA2) * aT + B(aA1, aA2)) * aT + C(aA1)) * aT }
    function getSlope(aT, aA1, aA2) { return 3.0 * A(aA1, aA2) * aT * aT + 2.0 * B(aA1, aA2) * aT + C(aA1) }

    function binarySubdivide(aX, aA, aB, mX1, mX2) {
      var currentX, currentT, i = 0;
      do {
        currentT = aA + (aB - aA) / 2.0;
        currentX = calcBezier(currentT, mX1, mX2) - aX;
        if (currentX > 0.0) { aB = currentT; } else { aA = currentT; }
      } while (Math.abs(currentX) > 0.0000001 && ++i < 10);
      return currentT;
    }

    function newtonRaphsonIterate(aX, aGuessT, mX1, mX2) {
      for (var i = 0; i < 4; ++i) {
        var currentSlope = getSlope(aGuessT, mX1, mX2);
        if (currentSlope === 0.0) { return aGuessT; }
        var currentX = calcBezier(aGuessT, mX1, mX2) - aX;
        aGuessT -= currentX / currentSlope;
      }
      return aGuessT;
    }

    function bezier(mX1, mY1, mX2, mY2) {

      if (!(0 <= mX1 && mX1 <= 1 && 0 <= mX2 && mX2 <= 1)) { return; }
      var sampleValues = new Float32Array(kSplineTableSize);

      if (mX1 !== mY1 || mX2 !== mY2) {
        for (var i = 0; i < kSplineTableSize; ++i) {
          sampleValues[i] = calcBezier(i * kSampleStepSize, mX1, mX2);
        }
      }

      function getTForX(aX) {

        var intervalStart = 0;
        var currentSample = 1;
        var lastSample = kSplineTableSize - 1;

        for (; currentSample !== lastSample && sampleValues[currentSample] <= aX; ++currentSample) {
          intervalStart += kSampleStepSize;
        }

        --currentSample;

        var dist = (aX - sampleValues[currentSample]) / (sampleValues[currentSample + 1] - sampleValues[currentSample]);
        var guessForT = intervalStart + dist * kSampleStepSize;
        var initialSlope = getSlope(guessForT, mX1, mX2);

        if (initialSlope >= 0.001) {
          return newtonRaphsonIterate(aX, guessForT, mX1, mX2);
        } else if (initialSlope === 0.0) {
          return guessForT;
        } else {
          return binarySubdivide(aX, intervalStart, intervalStart + kSampleStepSize, mX1, mX2);
        }

      }

      return function (x) {
        if (mX1 === mY1 && mX2 === mY2) { return x; }
        if (x === 0 || x === 1) { return x; }
        return calcBezier(getTForX(x), mY1, mY2);
      }

    }

    return bezier;

  })();

  var penner = (function () {

    // Based on jQuery UI's implemenation of easing equations from Robert Penner (http://www.robertpenner.com/easing)

    var eases = { linear: function () { return function (t) { return t; }; } };

    var functionEasings = {
      Sine: function () { return function (t) { return 1 - Math.cos(t * Math.PI / 2); }; },
      Circ: function () { return function (t) { return 1 - Math.sqrt(1 - t * t); }; },
      Back: function () { return function (t) { return t * t * (3 * t - 2); }; },
      Bounce: function () { return function (t) {
        var pow2, b = 4;
        while (t < (( pow2 = Math.pow(2, --b)) - 1) / 11) {}
        return 1 / Math.pow(4, 3 - b) - 7.5625 * Math.pow(( pow2 * 3 - 2 ) / 22 - t, 2)
      }; },
      Elastic: function (amplitude, period) {
        if ( amplitude === void 0 ) amplitude = 1;
        if ( period === void 0 ) period = .5;

        var a = minMax(amplitude, 1, 10);
        var p = minMax(period, .1, 2);
        return function (t) {
          return (t === 0 || t === 1) ? t : 
            -a * Math.pow(2, 10 * (t - 1)) * Math.sin((((t - 1) - (p / (Math.PI * 2) * Math.asin(1 / a))) * (Math.PI * 2)) / p);
        }
      }
    };

    var baseEasings = ['Quad', 'Cubic', 'Quart', 'Quint', 'Expo'];

    baseEasings.forEach(function (name, i) {
      functionEasings[name] = function () { return function (t) { return Math.pow(t, i + 2); }; };
    });

    Object.keys(functionEasings).forEach(function (name) {
      var easeIn = functionEasings[name];
      eases['easeIn' + name] = easeIn;
      eases['easeOut' + name] = function (a, b) { return function (t) { return 1 - easeIn(a, b)(1 - t); }; };
      eases['easeInOut' + name] = function (a, b) { return function (t) { return t < 0.5 ? easeIn(a, b)(t * 2) / 2 : 
        1 - easeIn(a, b)(t * -2 + 2) / 2; }; };
    });

    return eases;

  })();

  function parseEasings(easing, duration) {
    if (is.fnc(easing)) { return easing; }
    var name = easing.split('(')[0];
    var ease = penner[name];
    var args = parseEasingParameters(easing);
    switch (name) {
      case 'spring' : return spring(easing, duration);
      case 'cubicBezier' : return applyArguments(bezier, args);
      case 'steps' : return applyArguments(steps, args);
      default : return applyArguments(ease, args);
    }
  }

  // Strings

  function selectString(str) {
    try {
      var nodes = document.querySelectorAll(str);
      return nodes;
    } catch(e) {
      return;
    }
  }

  // Arrays

  function filterArray(arr, callback) {
    var len = arr.length;
    var thisArg = arguments.length >= 2 ? arguments[1] : void 0;
    var result = [];
    for (var i = 0; i < len; i++) {
      if (i in arr) {
        var val = arr[i];
        if (callback.call(thisArg, val, i, arr)) {
          result.push(val);
        }
      }
    }
    return result;
  }

  function flattenArray(arr) {
    return arr.reduce(function (a, b) { return a.concat(is.arr(b) ? flattenArray(b) : b); }, []);
  }

  function toArray(o) {
    if (is.arr(o)) { return o; }
    if (is.str(o)) { o = selectString(o) || o; }
    if (o instanceof NodeList || o instanceof HTMLCollection) { return [].slice.call(o); }
    return [o];
  }

  function arrayContains(arr, val) {
    return arr.some(function (a) { return a === val; });
  }

  // Objects

  function cloneObject(o) {
    var clone = {};
    for (var p in o) { clone[p] = o[p]; }
    return clone;
  }

  function replaceObjectProps(o1, o2) {
    var o = cloneObject(o1);
    for (var p in o1) { o[p] = o2.hasOwnProperty(p) ? o2[p] : o1[p]; }
    return o;
  }

  function mergeObjects(o1, o2) {
    var o = cloneObject(o1);
    for (var p in o2) { o[p] = is.und(o1[p]) ? o2[p] : o1[p]; }
    return o;
  }

  // Colors

  function rgbToRgba(rgbValue) {
    var rgb = /rgb\((\d+,\s*[\d]+,\s*[\d]+)\)/g.exec(rgbValue);
    return rgb ? ("rgba(" + (rgb[1]) + ",1)") : rgbValue;
  }

  function hexToRgba(hexValue) {
    var rgx = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    var hex = hexValue.replace(rgx, function (m, r, g, b) { return r + r + g + g + b + b; } );
    var rgb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    var r = parseInt(rgb[1], 16);
    var g = parseInt(rgb[2], 16);
    var b = parseInt(rgb[3], 16);
    return ("rgba(" + r + "," + g + "," + b + ",1)");
  }

  function hslToRgba(hslValue) {
    var hsl = /hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/g.exec(hslValue) || /hsla\((\d+),\s*([\d.]+)%,\s*([\d.]+)%,\s*([\d.]+)\)/g.exec(hslValue);
    var h = parseInt(hsl[1], 10) / 360;
    var s = parseInt(hsl[2], 10) / 100;
    var l = parseInt(hsl[3], 10) / 100;
    var a = hsl[4] || 1;
    function hue2rgb(p, q, t) {
      if (t < 0) { t += 1; }
      if (t > 1) { t -= 1; }
      if (t < 1/6) { return p + (q - p) * 6 * t; }
      if (t < 1/2) { return q; }
      if (t < 2/3) { return p + (q - p) * (2/3 - t) * 6; }
      return p;
    }
    var r, g, b;
    if (s == 0) {
      r = g = b = l;
    } else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return ("rgba(" + (r * 255) + "," + (g * 255) + "," + (b * 255) + "," + a + ")");
  }

  function colorToRgb(val) {
    if (is.rgb(val)) { return rgbToRgba(val); }
    if (is.hex(val)) { return hexToRgba(val); }
    if (is.hsl(val)) { return hslToRgba(val); }
  }

  // Units

  function getUnit(val) {
    var split = /[+-]?\d*\.?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(%|px|pt|em|rem|in|cm|mm|ex|ch|pc|vw|vh|vmin|vmax|deg|rad|turn)?$/.exec(val);
    if (split) { return split[1]; }
  }

  function getTransformUnit(propName) {
    if (stringContains(propName, 'translate') || propName === 'perspective') { return 'px'; }
    if (stringContains(propName, 'rotate') || stringContains(propName, 'skew')) { return 'deg'; }
  }

  // Values

  function getFunctionValue(val, animatable) {
    if (!is.fnc(val)) { return val; }
    return val(animatable.target, animatable.id, animatable.total);
  }

  function getAttribute(el, prop) {
    return el.getAttribute(prop);
  }

  function convertPxToUnit(el, value, unit) {
    var valueUnit = getUnit(value);
    if (arrayContains([unit, 'deg', 'rad', 'turn'], valueUnit)) { return value; }
    var cached = cache.CSS[value + unit];
    if (!is.und(cached)) { return cached; }
    var baseline = 100;
    var tempEl = document.createElement(el.tagName);
    var parentEl = (el.parentNode && (el.parentNode !== document)) ? el.parentNode : document.body;
    parentEl.appendChild(tempEl);
    tempEl.style.position = 'absolute';
    tempEl.style.width = baseline + unit;
    var factor = baseline / tempEl.offsetWidth;
    parentEl.removeChild(tempEl);
    var convertedUnit = factor * parseFloat(value);
    cache.CSS[value + unit] = convertedUnit;
    return convertedUnit;
  }

  function getCSSValue(el, prop, unit) {
    if (prop in el.style) {
      var uppercasePropName = prop.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
      var value = el.style[prop] || getComputedStyle(el).getPropertyValue(uppercasePropName) || '0';
      return unit ? convertPxToUnit(el, value, unit) : value;
    }
  }

  function getAnimationType(el, prop) {
    if (is.dom(el) && !is.inp(el) && (getAttribute(el, prop) || (is.svg(el) && el[prop]))) { return 'attribute'; }
    if (is.dom(el) && arrayContains(validTransforms, prop)) { return 'transform'; }
    if (is.dom(el) && (prop !== 'transform' && getCSSValue(el, prop))) { return 'css'; }
    if (el[prop] != null) { return 'object'; }
  }

  function getElementTransforms(el) {
    if (!is.dom(el)) { return; }
    var str = el.style.transform || '';
    var reg  = /(\w+)\(([^)]*)\)/g;
    var transforms = new Map();
    var m; while (m = reg.exec(str)) { transforms.set(m[1], m[2]); }
    return transforms;
  }

  function getTransformValue(el, propName, animatable, unit) {
    var defaultVal = stringContains(propName, 'scale') ? 1 : 0 + getTransformUnit(propName);
    var value = getElementTransforms(el).get(propName) || defaultVal;
    if (animatable) {
      animatable.transforms.list.set(propName, value);
      animatable.transforms['last'] = propName;
    }
    return unit ? convertPxToUnit(el, value, unit) : value;
  }

  function getOriginalTargetValue(target, propName, unit, animatable) {
    switch (getAnimationType(target, propName)) {
      case 'transform': return getTransformValue(target, propName, animatable, unit);
      case 'css': return getCSSValue(target, propName, unit);
      case 'attribute': return getAttribute(target, propName);
      default: return target[propName] || 0;
    }
  }

  function getRelativeValue(to, from) {
    var operator = /^(\*=|\+=|-=)/.exec(to);
    if (!operator) { return to; }
    var u = getUnit(to) || 0;
    var x = parseFloat(from);
    var y = parseFloat(to.replace(operator[0], ''));
    switch (operator[0][0]) {
      case '+': return x + y + u;
      case '-': return x - y + u;
      case '*': return x * y + u;
    }
  }

  function validateValue(val, unit) {
    if (is.col(val)) { return colorToRgb(val); }
    if (/\s/g.test(val)) { return val; }
    var originalUnit = getUnit(val);
    var unitLess = originalUnit ? val.substr(0, val.length - originalUnit.length) : val;
    if (unit) { return unitLess + unit; }
    return unitLess;
  }

  // getTotalLength() equivalent for circle, rect, polyline, polygon and line shapes
  // adapted from https://gist.github.com/SebLambla/3e0550c496c236709744

  function getDistance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }

  function getCircleLength(el) {
    return Math.PI * 2 * getAttribute(el, 'r');
  }

  function getRectLength(el) {
    return (getAttribute(el, 'width') * 2) + (getAttribute(el, 'height') * 2);
  }

  function getLineLength(el) {
    return getDistance(
      {x: getAttribute(el, 'x1'), y: getAttribute(el, 'y1')}, 
      {x: getAttribute(el, 'x2'), y: getAttribute(el, 'y2')}
    );
  }

  function getPolylineLength(el) {
    var points = el.points;
    var totalLength = 0;
    var previousPos;
    for (var i = 0 ; i < points.numberOfItems; i++) {
      var currentPos = points.getItem(i);
      if (i > 0) { totalLength += getDistance(previousPos, currentPos); }
      previousPos = currentPos;
    }
    return totalLength;
  }

  function getPolygonLength(el) {
    var points = el.points;
    return getPolylineLength(el) + getDistance(points.getItem(points.numberOfItems - 1), points.getItem(0));
  }

  // Path animation

  function getTotalLength(el) {
    if (el.getTotalLength) { return el.getTotalLength(); }
    switch(el.tagName.toLowerCase()) {
      case 'circle': return getCircleLength(el);
      case 'rect': return getRectLength(el);
      case 'line': return getLineLength(el);
      case 'polyline': return getPolylineLength(el);
      case 'polygon': return getPolygonLength(el);
    }
  }

  function setDashoffset(el) {
    var pathLength = getTotalLength(el);
    el.setAttribute('stroke-dasharray', pathLength);
    return pathLength;
  }

  // Motion path

  function getParentSvgEl(el) {
    var parentEl = el.parentNode;
    while (is.svg(parentEl)) {
      if (!is.svg(parentEl.parentNode)) { break; }
      parentEl = parentEl.parentNode;
    }
    return parentEl;
  }

  function getParentSvg(pathEl, svgData) {
    var svg = svgData || {};
    var parentSvgEl = svg.el || getParentSvgEl(pathEl);
    var rect = parentSvgEl.getBoundingClientRect();
    var viewBoxAttr = getAttribute(parentSvgEl, 'viewBox');
    var width = rect.width;
    var height = rect.height;
    var viewBox = svg.viewBox || (viewBoxAttr ? viewBoxAttr.split(' ') : [0, 0, width, height]);
    return {
      el: parentSvgEl,
      viewBox: viewBox,
      x: viewBox[0] / 1,
      y: viewBox[1] / 1,
      w: width / viewBox[2],
      h: height / viewBox[3]
    }
  }

  function getPath(path, percent) {
    var pathEl = is.str(path) ? selectString(path)[0] : path;
    var p = percent || 100;
    return function(property) {
      return {
        property: property,
        el: pathEl,
        svg: getParentSvg(pathEl),
        totalLength: getTotalLength(pathEl) * (p / 100)
      }
    }
  }

  function getPathProgress(path, progress) {
    function point(offset) {
      if ( offset === void 0 ) offset = 0;

      var l = progress + offset >= 1 ? progress + offset : 0;
      return path.el.getPointAtLength(l);
    }
    var svg = getParentSvg(path.el, path.svg);
    var p = point();
    var p0 = point(-1);
    var p1 = point(+1);
    switch (path.property) {
      case 'x': return (p.x - svg.x) * svg.w;
      case 'y': return (p.y - svg.y) * svg.h;
      case 'angle': return Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180 / Math.PI;
    }
  }

  // Decompose value

  function decomposeValue(val, unit) {
    // const rgx = /-?\d*\.?\d+/g; // handles basic numbers
    // const rgx = /[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g; // handles exponents notation
    var rgx = /[+-]?\d*\.?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g; // handles exponents notation
    var value = validateValue((is.pth(val) ? val.totalLength : val), unit) + '';
    return {
      original: value,
      numbers: value.match(rgx) ? value.match(rgx).map(Number) : [0],
      strings: (is.str(val) || unit) ? value.split(rgx) : []
    }
  }

  // Animatables

  function parseTargets(targets) {
    var targetsArray = targets ? (flattenArray(is.arr(targets) ? targets.map(toArray) : toArray(targets))) : [];
    return filterArray(targetsArray, function (item, pos, self) { return self.indexOf(item) === pos; });
  }

  function getAnimatables(targets) {
    var parsed = parseTargets(targets);
    return parsed.map(function (t, i) {
      return {target: t, id: i, total: parsed.length, transforms: { list: getElementTransforms(t) } };
    });
  }

  // Properties

  function normalizePropertyTweens(prop, tweenSettings) {
    var settings = cloneObject(tweenSettings);
    // Override duration if easing is a spring
    if (/^spring/.test(settings.easing)) { settings.duration = spring(settings.easing); }
    if (is.arr(prop)) {
      var l = prop.length;
      var isFromTo = (l === 2 && !is.obj(prop[0]));
      if (!isFromTo) {
        // Duration divided by the number of tweens
        if (!is.fnc(tweenSettings.duration)) { settings.duration = tweenSettings.duration / l; }
      } else {
        // Transform [from, to] values shorthand to a valid tween value
        prop = {value: prop};
      }
    }
    var propArray = is.arr(prop) ? prop : [prop];
    return propArray.map(function (v, i) {
      var obj = (is.obj(v) && !is.pth(v)) ? v : {value: v};
      // Default delay value should only be applied to the first tween
      if (is.und(obj.delay)) { obj.delay = !i ? tweenSettings.delay : 0; }
      // Default endDelay value should only be applied to the last tween
      if (is.und(obj.endDelay)) { obj.endDelay = i === propArray.length - 1 ? tweenSettings.endDelay : 0; }
      return obj;
    }).map(function (k) { return mergeObjects(k, settings); });
  }


  function flattenKeyframes(keyframes) {
    var propertyNames = filterArray(flattenArray(keyframes.map(function (key) { return Object.keys(key); })), function (p) { return is.key(p); })
    .reduce(function (a,b) { if (a.indexOf(b) < 0) { a.push(b); } return a; }, []);
    var properties = {};
    var loop = function ( i ) {
      var propName = propertyNames[i];
      properties[propName] = keyframes.map(function (key) {
        var newKey = {};
        for (var p in key) {
          if (is.key(p)) {
            if (p == propName) { newKey.value = key[p]; }
          } else {
            newKey[p] = key[p];
          }
        }
        return newKey;
      });
    };

    for (var i = 0; i < propertyNames.length; i++) loop( i );
    return properties;
  }

  function getProperties(tweenSettings, params) {
    var properties = [];
    var keyframes = params.keyframes;
    if (keyframes) { params = mergeObjects(flattenKeyframes(keyframes), params); }
    for (var p in params) {
      if (is.key(p)) {
        properties.push({
          name: p,
          tweens: normalizePropertyTweens(params[p], tweenSettings)
        });
      }
    }
    return properties;
  }

  // Tweens

  function normalizeTweenValues(tween, animatable) {
    var t = {};
    for (var p in tween) {
      var value = getFunctionValue(tween[p], animatable);
      if (is.arr(value)) {
        value = value.map(function (v) { return getFunctionValue(v, animatable); });
        if (value.length === 1) { value = value[0]; }
      }
      t[p] = value;
    }
    t.duration = parseFloat(t.duration);
    t.delay = parseFloat(t.delay);
    return t;
  }

  function normalizeTweens(prop, animatable) {
    var previousTween;
    return prop.tweens.map(function (t) {
      var tween = normalizeTweenValues(t, animatable);
      var tweenValue = tween.value;
      var to = is.arr(tweenValue) ? tweenValue[1] : tweenValue;
      var toUnit = getUnit(to);
      var originalValue = getOriginalTargetValue(animatable.target, prop.name, toUnit, animatable);
      var previousValue = previousTween ? previousTween.to.original : originalValue;
      var from = is.arr(tweenValue) ? tweenValue[0] : previousValue;
      var fromUnit = getUnit(from) || getUnit(originalValue);
      var unit = toUnit || fromUnit;
      if (is.und(to)) { to = previousValue; }
      tween.from = decomposeValue(from, unit);
      tween.to = decomposeValue(getRelativeValue(to, from), unit);
      tween.start = previousTween ? previousTween.end : 0;
      tween.end = tween.start + tween.delay + tween.duration + tween.endDelay;
      tween.easing = parseEasings(tween.easing, tween.duration);
      tween.isPath = is.pth(tweenValue);
      tween.isColor = is.col(tween.from.original);
      if (tween.isColor) { tween.round = 1; }
      previousTween = tween;
      return tween;
    });
  }

  // Tween progress

  var setProgressValue = {
    css: function (t, p, v) { return t.style[p] = v; },
    attribute: function (t, p, v) { return t.setAttribute(p, v); },
    object: function (t, p, v) { return t[p] = v; },
    transform: function (t, p, v, transforms, manual) {
      transforms.list.set(p, v);
      if (p === transforms.last || manual) {
        var str = '';
        transforms.list.forEach(function (value, prop) { str += prop + "(" + value + ") "; });
        t.style.transform = str;
      }
    }
  };

  // Set Value helper

  function setTargetsValue(targets, properties) {
    var animatables = getAnimatables(targets);
    animatables.forEach(function (animatable) {
      for (var property in properties) {
        var value = getFunctionValue(properties[property], animatable);
        var target = animatable.target;
        var valueUnit = getUnit(value);
        var originalValue = getOriginalTargetValue(target, property, valueUnit, animatable);
        var unit = valueUnit || getUnit(originalValue);
        var to = getRelativeValue(validateValue(value, unit), originalValue);
        var animType = getAnimationType(target, property);
        setProgressValue[animType](target, property, to, animatable.transforms, true);
      }
    });
  }

  // Animations

  function createAnimation(animatable, prop) {
    var animType = getAnimationType(animatable.target, prop.name);
    if (animType) {
      var tweens = normalizeTweens(prop, animatable);
      var lastTween = tweens[tweens.length - 1];
      return {
        type: animType,
        property: prop.name,
        animatable: animatable,
        tweens: tweens,
        duration: lastTween.end,
        delay: tweens[0].delay,
        endDelay: lastTween.endDelay
      }
    }
  }

  function getAnimations(animatables, properties) {
    return filterArray(flattenArray(animatables.map(function (animatable) {
      return properties.map(function (prop) {
        return createAnimation(animatable, prop);
      });
    })), function (a) { return !is.und(a); });
  }

  // Create Instance

  function getInstanceTimings(animations, tweenSettings) {
    var animLength = animations.length;
    var getTlOffset = function (anim) { return anim.timelineOffset ? anim.timelineOffset : 0; };
    var timings = {};
    timings.duration = animLength ? Math.max.apply(Math, animations.map(function (anim) { return getTlOffset(anim) + anim.duration; })) : tweenSettings.duration;
    timings.delay = animLength ? Math.min.apply(Math, animations.map(function (anim) { return getTlOffset(anim) + anim.delay; })) : tweenSettings.delay;
    timings.endDelay = animLength ? timings.duration - Math.max.apply(Math, animations.map(function (anim) { return getTlOffset(anim) + anim.duration - anim.endDelay; })) : tweenSettings.endDelay;
    return timings;
  }

  var instanceID = 0;

  function createNewInstance(params) {
    var instanceSettings = replaceObjectProps(defaultInstanceSettings, params);
    var tweenSettings = replaceObjectProps(defaultTweenSettings, params);
    var properties = getProperties(tweenSettings, params);
    var animatables = getAnimatables(params.targets);
    var animations = getAnimations(animatables, properties);
    var timings = getInstanceTimings(animations, tweenSettings);
    var id = instanceID;
    instanceID++;
    return mergeObjects(instanceSettings, {
      id: id,
      children: [],
      animatables: animatables,
      animations: animations,
      duration: timings.duration,
      delay: timings.delay,
      endDelay: timings.endDelay
    });
  }

  // Core

  var activeInstances = [];
  var pausedInstances = [];
  var raf;

  var engine = (function () {
    function play() { 
      raf = requestAnimationFrame(step);
    }
    function step(t) {
      var activeInstancesLength = activeInstances.length;
      if (activeInstancesLength) {
        var i = 0;
        while (i < activeInstancesLength) {
          var activeInstance = activeInstances[i];
          if (!activeInstance.paused) {
            activeInstance.tick(t);
          } else {
            var instanceIndex = activeInstances.indexOf(activeInstance);
            if (instanceIndex > -1) {
              activeInstances.splice(instanceIndex, 1);
              activeInstancesLength = activeInstances.length;
            }
          }
          i++;
        }
        play();
      } else {
        raf = cancelAnimationFrame(raf);
      }
    }
    return play;
  })();

  function handleVisibilityChange() {
    if (document.hidden) {
      activeInstances.forEach(function (ins) { return ins.pause(); });
      pausedInstances = activeInstances.slice(0);
      anime.running = activeInstances = [];
    } else {
      pausedInstances.forEach(function (ins) { return ins.play(); });
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  // Public Instance

  function anime(params) {
    if ( params === void 0 ) params = {};


    var startTime = 0, lastTime = 0, now = 0;
    var children, childrenLength = 0;
    var resolve = null;

    function makePromise(instance) {
      var promise = window.Promise && new Promise(function (_resolve) { return resolve = _resolve; });
      instance.finished = promise;
      return promise;
    }

    var instance = createNewInstance(params);
    var promise = makePromise(instance);

    function toggleInstanceDirection() {
      var direction = instance.direction;
      if (direction !== 'alternate') {
        instance.direction = direction !== 'normal' ? 'normal' : 'reverse';
      }
      instance.reversed = !instance.reversed;
      children.forEach(function (child) { return child.reversed = instance.reversed; });
    }

    function adjustTime(time) {
      return instance.reversed ? instance.duration - time : time;
    }

    function resetTime() {
      startTime = 0;
      lastTime = adjustTime(instance.currentTime) * (1 / anime.speed);
    }

    function seekChild(time, child) {
      if (child) { child.seek(time - child.timelineOffset); }
    }

    function syncInstanceChildren(time) {
      if (!instance.reversePlayback) {
        for (var i = 0; i < childrenLength; i++) { seekChild(time, children[i]); }
      } else {
        for (var i$1 = childrenLength; i$1--;) { seekChild(time, children[i$1]); }
      }
    }

    function setAnimationsProgress(insTime) {
      var i = 0;
      var animations = instance.animations;
      var animationsLength = animations.length;
      while (i < animationsLength) {
        var anim = animations[i];
        var animatable = anim.animatable;
        var tweens = anim.tweens;
        var tweenLength = tweens.length - 1;
        var tween = tweens[tweenLength];
        // Only check for keyframes if there is more than one tween
        if (tweenLength) { tween = filterArray(tweens, function (t) { return (insTime < t.end); })[0] || tween; }
        var elapsed = minMax(insTime - tween.start - tween.delay, 0, tween.duration) / tween.duration;
        var eased = isNaN(elapsed) ? 1 : tween.easing(elapsed);
        var strings = tween.to.strings;
        var round = tween.round;
        var numbers = [];
        var toNumbersLength = tween.to.numbers.length;
        var progress = (void 0);
        for (var n = 0; n < toNumbersLength; n++) {
          var value = (void 0);
          var toNumber = tween.to.numbers[n];
          var fromNumber = tween.from.numbers[n] || 0;
          if (!tween.isPath) {
            value = fromNumber + (eased * (toNumber - fromNumber));
          } else {
            value = getPathProgress(tween.value, eased * toNumber);
          }
          if (round) {
            if (!(tween.isColor && n > 2)) {
              value = Math.round(value * round) / round;
            }
          }
          numbers.push(value);
        }
        // Manual Array.reduce for better performances
        var stringsLength = strings.length;
        if (!stringsLength) {
          progress = numbers[0];
        } else {
          progress = strings[0];
          for (var s = 0; s < stringsLength; s++) {
            var a = strings[s];
            var b = strings[s + 1];
            var n$1 = numbers[s];
            if (!isNaN(n$1)) {
              if (!b) {
                progress += n$1 + ' ';
              } else {
                progress += n$1 + b;
              }
            }
          }
        }
        setProgressValue[anim.type](animatable.target, anim.property, progress, animatable.transforms);
        anim.currentValue = progress;
        i++;
      }
    }

    function setCallback(cb) {
      if (instance[cb] && !instance.passThrough) { instance[cb](instance); }
    }

    function countIteration() {
      if (instance.remaining && instance.remaining !== true) {
        instance.remaining--;
      }
    }

    function setInstanceProgress(engineTime) {
      var insDuration = instance.duration;
      var insDelay = instance.delay;
      var insEndDelay = insDuration - instance.endDelay;
      var insTime = adjustTime(engineTime);
      instance.progress = minMax((insTime / insDuration) * 100, 0, 100);
      instance.reversePlayback = insTime < instance.currentTime;
      if (children) { syncInstanceChildren(insTime); }
      if (!instance.began && instance.currentTime > 0) {
        instance.began = true;
        setCallback('begin');
      }
      if (!instance.loopBegan && instance.currentTime > 0) {
        instance.loopBegan = true;
        setCallback('loopBegin');
      }
      if (insTime <= insDelay && instance.currentTime !== 0) {
        setAnimationsProgress(0);
      }
      if ((insTime >= insEndDelay && instance.currentTime !== insDuration) || !insDuration) {
        setAnimationsProgress(insDuration);
      }
      if (insTime > insDelay && insTime < insEndDelay) {
        if (!instance.changeBegan) {
          instance.changeBegan = true;
          instance.changeCompleted = false;
          setCallback('changeBegin');
        }
        setCallback('change');
        setAnimationsProgress(insTime);
      } else {
        if (instance.changeBegan) {
          instance.changeCompleted = true;
          instance.changeBegan = false;
          setCallback('changeComplete');
        }
      }
      instance.currentTime = minMax(insTime, 0, insDuration);
      if (instance.began) { setCallback('update'); }
      if (engineTime >= insDuration) {
        lastTime = 0;
        countIteration();
        if (!instance.remaining) {
          instance.paused = true;
          if (!instance.completed) {
            instance.completed = true;
            setCallback('loopComplete');
            setCallback('complete');
            if (!instance.passThrough && 'Promise' in window) {
              resolve();
              promise = makePromise(instance);
            }
          }
        } else {
          startTime = now;
          setCallback('loopComplete');
          instance.loopBegan = false;
          if (instance.direction === 'alternate') {
            toggleInstanceDirection();
          }
        }
      }
    }

    instance.reset = function() {
      var direction = instance.direction;
      instance.passThrough = false;
      instance.currentTime = 0;
      instance.progress = 0;
      instance.paused = true;
      instance.began = false;
      instance.loopBegan = false;
      instance.changeBegan = false;
      instance.completed = false;
      instance.changeCompleted = false;
      instance.reversePlayback = false;
      instance.reversed = direction === 'reverse';
      instance.remaining = instance.loop;
      children = instance.children;
      childrenLength = children.length;
      for (var i = childrenLength; i--;) { instance.children[i].reset(); }
      if (instance.reversed && instance.loop !== true || (direction === 'alternate' && instance.loop === 1)) { instance.remaining++; }
      setAnimationsProgress(instance.reversed ? instance.duration : 0);
    };

    // Set Value helper

    instance.set = function(targets, properties) {
      setTargetsValue(targets, properties);
      return instance;
    };

    instance.tick = function(t) {
      now = t;
      if (!startTime) { startTime = now; }
      setInstanceProgress((now + (lastTime - startTime)) * anime.speed);
    };

    instance.seek = function(time) {
      setInstanceProgress(adjustTime(time));
    };

    instance.pause = function() {
      instance.paused = true;
      resetTime();
    };

    instance.play = function() {
      if (!instance.paused) { return; }
      if (instance.completed) { instance.reset(); }
      instance.paused = false;
      activeInstances.push(instance);
      resetTime();
      if (!raf) { engine(); }
    };

    instance.reverse = function() {
      toggleInstanceDirection();
      instance.completed = instance.reversed ? false : true;
      resetTime();
    };

    instance.restart = function() {
      instance.reset();
      instance.play();
    };

    instance.reset();

    if (instance.autoplay) { instance.play(); }

    return instance;

  }

  // Remove targets from animation

  function removeTargetsFromAnimations(targetsArray, animations) {
    for (var a = animations.length; a--;) {
      if (arrayContains(targetsArray, animations[a].animatable.target)) {
        animations.splice(a, 1);
      }
    }
  }

  function removeTargets(targets) {
    var targetsArray = parseTargets(targets);
    for (var i = activeInstances.length; i--;) {
      var instance = activeInstances[i];
      var animations = instance.animations;
      var children = instance.children;
      removeTargetsFromAnimations(targetsArray, animations);
      for (var c = children.length; c--;) {
        var child = children[c];
        var childAnimations = child.animations;
        removeTargetsFromAnimations(targetsArray, childAnimations);
        if (!childAnimations.length && !child.children.length) { children.splice(c, 1); }
      }
      if (!animations.length && !children.length) { instance.pause(); }
    }
  }

  // Stagger helpers

  function stagger(val, params) {
    if ( params === void 0 ) params = {};

    var direction = params.direction || 'normal';
    var easing = params.easing ? parseEasings(params.easing) : null;
    var grid = params.grid;
    var axis = params.axis;
    var fromIndex = params.from || 0;
    var fromFirst = fromIndex === 'first';
    var fromCenter = fromIndex === 'center';
    var fromLast = fromIndex === 'last';
    var isRange = is.arr(val);
    var val1 = isRange ? parseFloat(val[0]) : parseFloat(val);
    var val2 = isRange ? parseFloat(val[1]) : 0;
    var unit = getUnit(isRange ? val[1] : val) || 0;
    var start = params.start || 0 + (isRange ? val1 : 0);
    var values = [];
    var maxValue = 0;
    return function (el, i, t) {
      if (fromFirst) { fromIndex = 0; }
      if (fromCenter) { fromIndex = (t - 1) / 2; }
      if (fromLast) { fromIndex = t - 1; }
      if (!values.length) {
        for (var index = 0; index < t; index++) {
          if (!grid) {
            values.push(Math.abs(fromIndex - index));
          } else {
            var fromX = !fromCenter ? fromIndex%grid[0] : (grid[0]-1)/2;
            var fromY = !fromCenter ? Math.floor(fromIndex/grid[0]) : (grid[1]-1)/2;
            var toX = index%grid[0];
            var toY = Math.floor(index/grid[0]);
            var distanceX = fromX - toX;
            var distanceY = fromY - toY;
            var value = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
            if (axis === 'x') { value = -distanceX; }
            if (axis === 'y') { value = -distanceY; }
            values.push(value);
          }
          maxValue = Math.max.apply(Math, values);
        }
        if (easing) { values = values.map(function (val) { return easing(val / maxValue) * maxValue; }); }
        if (direction === 'reverse') { values = values.map(function (val) { return axis ? (val < 0) ? val * -1 : -val : Math.abs(maxValue - val); }); }
      }
      var spacing = isRange ? (val2 - val1) / maxValue : val1;
      return start + (spacing * (Math.round(values[i] * 100) / 100)) + unit;
    }
  }

  // Timeline

  function timeline(params) {
    if ( params === void 0 ) params = {};

    var tl = anime(params);
    tl.duration = 0;
    tl.add = function(instanceParams, timelineOffset) {
      var tlIndex = activeInstances.indexOf(tl);
      var children = tl.children;
      if (tlIndex > -1) { activeInstances.splice(tlIndex, 1); }
      function passThrough(ins) { ins.passThrough = true; }
      for (var i = 0; i < children.length; i++) { passThrough(children[i]); }
      var insParams = mergeObjects(instanceParams, replaceObjectProps(defaultTweenSettings, params));
      insParams.targets = insParams.targets || params.targets;
      var tlDuration = tl.duration;
      insParams.autoplay = false;
      insParams.direction = tl.direction;
      insParams.timelineOffset = is.und(timelineOffset) ? tlDuration : getRelativeValue(timelineOffset, tlDuration);
      passThrough(tl);
      tl.seek(insParams.timelineOffset);
      var ins = anime(insParams);
      passThrough(ins);
      children.push(ins);
      var timings = getInstanceTimings(children, params);
      tl.delay = timings.delay;
      tl.endDelay = timings.endDelay;
      tl.duration = timings.duration;
      tl.seek(0);
      tl.reset();
      if (tl.autoplay) { tl.play(); }
      return tl;
    };
    return tl;
  }

  anime.version = '3.2.0';
  anime.speed = 1;
  anime.running = activeInstances;
  anime.remove = removeTargets;
  anime.get = getOriginalTargetValue;
  anime.set = setTargetsValue;
  anime.convertPx = convertPxToUnit;
  anime.path = getPath;
  anime.setDashoffset = setDashoffset;
  anime.stagger = stagger;
  anime.timeline = timeline;
  anime.easing = parseEasings;
  anime.penner = penner;
  anime.random = function (min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; };

  let data_fns = {
    "stream": build_data$5,
    "persistent_query": build_data$a
  };

  let rendering_fns = {
    "stream": render$5,
    "persistent_query": render$a,
  };

  function add_metadata(component, styles) {
    const { row_default_fill } = styles;

    switch(component.kind) {
    case "stream":
      component.partitions.forEach((partition, partition_id) => {
        partition.forEach((row, offset) => {
          row.record = {
            stream: component.name,
            partition: partition_id,
            offset: offset,
            t: row.t,
            key: row.key,
            value: row.value
          };

          row.style = { ...{ fill: row_default_fill }, ...row.style };
        });
      });

      return component;
    default:
      return component;
    }
  }

  function Specimen(container, styles$1) {
    this._container = container;
    this._styles = { ... styles, ...styles$1 };
    this._graph = new graphlib_1();
  }

  Specimen.prototype.add_root = function(node) {
    this._graph.setNode(node.name, add_metadata(node, this._styles));
    return this;
  };

  Specimen.prototype.add_child = function(parents, node) {
    this._graph.setNode(node.name, add_metadata(node, this._styles));

    parents.forEach(parent => {
      this._graph.setEdge(parent, node.name);
    });

    return this;
  };

  Specimen.prototype.get_node = function(name) {
    return this._graph.node(name);
  };

  Specimen.prototype.layout_buckets = function() {
    let index = {};
    const seq = graphlib_3.topsort(this._graph);

    seq.forEach(x => {
      const parents = this._graph.predecessors(x);

      if (parents.length == 0) {
        index[x] = 0;
      } else {
        const parent_indices = parents.reduce((o, k) => {
          o[k] = index[k];
          return o;
        }, {});

        const max_parent = Math.max(...Object.values(parent_indices));

        index[x] = max_parent + 1;
      }
    });

    return inverse_map(index);
  };

  Specimen.prototype.horizontal_layout = function() {
    const { svg_width } = this._styles;

    const buckets = this.layout_buckets();
    const n = Object.keys(buckets).length;
    const column_width = (svg_width / n);

    const layout = Object.entries(buckets).reduce((all, pair) => {
      const [i, names] = pair;
      const midpoint_x = (i * column_width) + (column_width / 2);

      let result = [];
      let top_y = 0;

      names.sort().forEach((name, i) => {
        const node = this._graph.node(name);
        const predecessors = this._graph.predecessors(name);
        const successors = this._graph.successors(name);

        const computed = {
          predecessors: predecessors,
          successors: successors,
          top_y: top_y,
          midpoint_x: midpoint_x
        };

        if (node.kind == "persistent_query") {
          const source_partitions = this._graph.predecessors(node.name).reduce((acc, parent) => {
            const node = this.get_node(parent);
            acc[parent] = Object.keys(node.partitions);          
            return acc;
          }, {});

          node.source_partitions = source_partitions;
          node.index = i;
        } 

        const data_fn = data_fns[node.kind];
        const data = data_fn(node, this._styles, computed);

        data.name = name;
        top_y = data.refs.bottom_y;
        result.push(data);
      });

      all.push(result);
      return all;
    }, []);

    return vertically_center_layout(layout).flatMap(xs => xs);
  };

  Specimen.prototype.draw_layout = function(layout) {
    const svg_data = build_data$c({}, this._styles);
    const svg_el = render$c(svg_data);

    layout.forEach(data => {
      const fn = rendering_fns[data.kind];
      const element = fn(data);
      svg_el.appendChild(element);
    });

    const target = document.querySelector(this._container);
    target.appendChild(svg_el);

    const query_text_data = build_data$d({}, this._styles);
    render$d(query_text_data, this._styles, {
      target: svg_el,
      layout: layout
    });

    const by_id = index_by_id(layout);
    pack(svg_data, by_id);
    pack(query_text_data, by_id);

    return by_id;
  };

  Specimen.prototype.animate = function(by_id) {
    let progress_el = undefined;

    let anime_commands = [];
    let anime_callbacks = {
      cbs: [],
      index: 0
    };

    const timeline = anime.timeline({
      autoplay: true,
      loop: true,
      endDelay: 250,
      begin: function(anim) {
        rewind_callbacks(anim, anime_callbacks);
      },
      update: function(anim) {
        const anime_t = anim.currentTime;

        if (!anim.reversePlayback) {
          fastfoward_callbacks(anim, anime_callbacks);
        } else {
          rewind_callbacks(anim, anime_callbacks);
        }

        progress_el.value = timeline.progress;
      }
    });

    const by_name = index_by_name(by_id);
    const objs = Object.values(by_id);

    const unpack_by_id = (id) => unpack(by_id, id);
    const unpack_by_name = (name) => unpack_by_id(by_name[name]);
    const pack$1 = (obj) => pack(obj, by_id);

    const data_fns = {
      by_id: unpack_by_id,
      by_name: unpack_by_name,
      pack: pack$1
    };

    const target = document.querySelector(this._container);
    const svg_el = document.getElementById(unpack_by_name("svg-container").id);

    const query_text_el = document.getElementById(unpack_by_name("query-text").id);

    const controls_data = build_data$b({}, this._styles, {
      timeline: timeline,
      callbacks: anime_callbacks,
    });
    const controls_el = render$b(controls_data);

    const free_data = build_data$e({}, this._styles);
    const free_el = render$e(free_data);

    svg_el.appendChild(free_el);

    if (this._styles.render_controls) {
      query_text_el.insertAdjacentElement("beforebegin", controls_el);
    }

    progress_el = document.getElementById(controls_data.rendering.progress.id);

    let rt_context = init_runtime(objs, data_fns);
    const animation_context = init_animation_context();

    while (rt_context.drained != true) {
      const next_context = tick(rt_context);
      const action = next_context.action;
      const lineage = next_context.lineage;

      if (action) {
        update_layout$1(action, data_fns, this._styles, free_el);
        const animation_seq = animation_seq$3(action, data_fns, this._styles);
        const anime_data = anime_data$3(animation_context, animation_seq, data_fns, lineage, this._styles);

        anime_commands = anime_commands.concat(anime_data.commands);
        anime_callbacks.cbs = anime_callbacks.cbs.concat(anime_data.callbacks);
      }

      rt_context = next_context;
    }

    anime_commands.forEach(c => timeline.add(c.params, c.t));

    const external_el = document.createElement("div");
    external_el.classList.add("external-objects");
    
    // Render cards last so that they fall outside
    // the SVG to track the absolute cursor position.
    Object.values(by_id).forEach(obj => {
      if (obj.kind == "row_card") {
        const card_el = render(obj);
        external_el.appendChild(card_el);
      }
    });

    svg_el.insertAdjacentElement("afterend", external_el);

    // Use a sorted data structure to skip this.
    anime_callbacks.cbs.sort(function(a, b) {
      if (a.t < b.t) {
        return -1;
      } else if (a.t == b.t) {
        return 0;
      } else {
        return 1;
      }
    });
  };

  Specimen.prototype.render = function() {
    const layout = this.horizontal_layout();
    const by_id = this.draw_layout(layout);
    this.animate(by_id);
  };

  function rewind_callbacks(anim, anime_callbacks) {
    const anime_t = anim.currentTime;
    const n = anime_callbacks.cbs.length;
    
    if ((anime_callbacks.index >= n) &&
        (anime_callbacks.cbs[n - 1].t >= anime_t)) {
      anime_callbacks.index = n - 1;
    }

    while ((anime_callbacks.index >= 0) &&
           (anime_callbacks.index < n) &&
           (anime_callbacks.cbs[anime_callbacks.index].t >= anime_t)) {
      anime_callbacks.cbs[anime_callbacks.index].undo();
      anime_callbacks.index--;
    }
  }

  function fastfoward_callbacks(anim, anime_callbacks) {
    const anime_t = anim.currentTime;

    if (anime_callbacks.index < 0) {
      anime_callbacks.index = 0;
    }

    while ((anime_callbacks.index < anime_callbacks.cbs.length) &&
           (anime_callbacks.cbs[anime_callbacks.index].t <= anime_t)) {
      anime_callbacks.cbs[anime_callbacks.index].apply();
      anime_callbacks.index++;
    }
  }

  core.registerLanguage('sql', ksql);
  core.initHighlightingOnLoad();

  exports.Specimen = Specimen;

  return exports;

}({}));
