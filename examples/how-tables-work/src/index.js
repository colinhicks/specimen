import { Specimen } from '../../../src/index';

import hljs from 'highlight.js/lib/core';
import ksql from '../../../src/ksql-highlightjs';
import hljs_js from 'highlight.js/lib/languages/javascript';

hljs.registerLanguage('sql', ksql);
hljs.registerLanguage('javascript', hljs_js);
hljs.initHighlightingOnLoad();
