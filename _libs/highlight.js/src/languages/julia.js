/*
Language: Julia
Description: Julia is a high-level, high-performance, dynamic programming language.
Author: Kenta Sato <bicycle1885@gmail.com>
Contributors: Alex Arslan <ararslan@comcast.net>, Fredrik Ekre <ekrefredrik@gmail.com>
Website: https://julialang.org
*/

export default function(hljs) {
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
  ]

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
  ]

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
  ]

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
  }

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
  ]

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
  }

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
  }

  var SHORT_FUNCTION_DEFINITION = {
    className: '',
    begin: VARIABLE_NAME_RE + '\\(.*\\)(\\s+where.*?)?\\s*(?==)',
    returnBegin:true,
    contains: [
        {begin: VARIABLE_NAME_RE + '(?=\\()', className: 'title'},
        FUNCTION_DEFINITION_PARAMETERS,
        WHERE_CLAUSE
    ]
  }

  var TYPEDEF = {
    className: 'class',
    variants: [
      { begin: '(?<=primitive[ \\t]+type[ \\t]+)' + VARIABLE_NAME_RE },
      { begin: '(?<=abstract[ \\t]+type[ \\t]+)' + VARIABLE_NAME_RE + '({.*?})?' },
      { begin: '(?<=(mutable[ \\t]+)?struct[ \\t]+)' + VARIABLE_NAME_RE + '({.*?})?' },
    ]
  }

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
