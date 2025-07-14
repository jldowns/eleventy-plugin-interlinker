import WikilinkParser from '../src/wikilink-parser.js';
import {defaultResolvingFn, defaultEmbedFn, defaultImageFn} from '../src/resolvers.js';
import {pageLookup} from '../src/find-page.js';
import test from 'ava';

const pageDirectory = pageLookup([
  {
    inputPath: '/home/user/website/hello-world.md',
    filePathStem: '/hello-world',
    fileSlug: 'hello-world',
    data: {
      title: 'Hello World, Title',
    },
  },
  {
    inputPath: '/home/user/website/blog/a-blog-post.md',
    filePathStem: '/blog/a-blog-post',
    fileSlug: 'a-blog-post',
    data: {
      title: 'Blog Post',
    },
  },
  {
    inputPath: '/home/user/website/bookmark/2024-01-04-♡-cinnis-dream-home-♡.md',
    filePathStem: '/bookmark/2024-01-04-♡-cinnis-dream-home-♡',
    fileSlug: 'cinnis-dream-home',
    data: {
      title: "♡ cinni''s dream home ♡"
    }
  }
]);

const opts = {
  resolvingFns: new Map([
    ['default', defaultResolvingFn],
    ['default-embed', defaultEmbedFn],
    ['default-image', defaultImageFn],
  ]),
  stubUrl: '/stubs/',
  imageExtensions: ['.png', '.svg', '.jpg', '.jpeg', '.gif']
};

test('parses wikilink', t => {
  const parser = new WikilinkParser(opts, new Set(), new Map());
  t.like(parser.parseSingle('[[hello-world]]', pageDirectory), {
    title: 'Hello World, Title',
    anchor: null,
    name: 'hello-world',
    isEmbed: false
  });
});

test('parses wikilink with title', t => {
  const parser = new WikilinkParser(opts, new Set(), new Map());
  t.like(parser.parseSingle('[[hello-world|Howdy]]', pageDirectory), {
    title: 'Howdy',
    anchor: null,
    name: 'hello-world',
    isEmbed: false
  });
});

test('parses wikilink with anchor', t => {
  const parser = new WikilinkParser(opts, new Set(), new Map());
  t.like(parser.parseSingle('[[hello-world#heading one]]', pageDirectory), {
    title: 'Hello World, Title',
    anchor: 'heading one',
    name: 'hello-world',
    isEmbed: false
  });
});

test('parses wikilink embed', t => {
  const parser = new WikilinkParser(opts, new Set(), new Map());
  t.like(parser.parseSingle('![[hello-world]]', pageDirectory), {
    title: 'Hello World, Title',
    anchor: null,
    name: 'hello-world',
    isEmbed: true
  });
});

test('parses wikilinks with weird formatting', t => {
  const parser = new WikilinkParser(opts, new Set(), new Map());

  const checks = [
    {
      str: '[[hello-world]]',
      result: {
        title: 'Hello World, Title',
        name: 'hello-world',
        isEmbed: false
      }
    },
    {
      str: '[[hello-world|custom title]]',
      result: {
        title: 'custom title',
        name: 'hello-world',
        isEmbed: false
      }
    },
    {
      str: '[[ hello-world | custom title ]]',
      result: {
        title: 'custom title',
        name: 'hello-world',
        isEmbed: false
      }
    },
    {
      str: '[[ hello-world   |  custom title ]]',
      result: {
        title: 'custom title',
        name: 'hello-world',
        isEmbed: false
      }
    },
    {
      str: '![[hello-world]]',
      result: {
        title: 'Hello World, Title',
        name: 'hello-world',
        isEmbed: true
      }
    },
  ];

  for (const check of checks) {
    const result = parser.parseSingle(check.str, pageDirectory);
    t.like(result, check.result);
  }
});

test('populates dead links set', t => {
  const deadLinks = new Set();
  const parser = new WikilinkParser(opts, deadLinks, new Map());
  t.is(deadLinks.size, 0);

  parser.parseSingle('[[hello-world]]', pageDirectory);
  t.is(deadLinks.size, 0);

  const invalid = parser.parseSingle('[[invalid]]', pageDirectory);
  t.is(deadLinks.size, 1);
  t.is(invalid.href, '/stubs/');
})

test('parses path lookup', t => {
  const deadLinks = new Set();
  const parser = new WikilinkParser(opts, deadLinks, new Map());

  const parsed = parser.parseSingle('[[/blog/a-blog-post.md]]', pageDirectory);
  t.is(parsed.isPath, true);
  t.is(parsed.exists, true);
  t.is(parsed.title, 'Blog Post');
})

test('parses relative path lookup (single back step)', t => {
  const deadLinks = new Set();
  const parser = new WikilinkParser(opts, deadLinks, new Map());

  const parsed = parser.parseSingle('[[../a-blog-post.md]]', pageDirectory, '/blog/sub-dir/some-page');
  t.is(parsed.isPath, true);
  t.is(parsed.exists, true);
  t.is(parsed.title, 'Blog Post');
})

test('parses relative path lookup (multiple back step)', t => {
  const deadLinks = new Set();
  const parser = new WikilinkParser(opts, deadLinks, new Map());

  const parsed = parser.parseSingle('[[../../a-blog-post.md]]', pageDirectory, '/blog/sub-dir/sub-dir/some-page');
  t.is(parsed.isPath, true);
  t.is(parsed.exists, true);
  t.is(parsed.title, 'Blog Post');
})

test('throws error on failure to find resolvingFn', t => {
  const parser = new WikilinkParser(opts, new Set(), new Map());
  let errorMsg;

  try {
    parser.parseSingle('[[fail:1234]]', pageDirectory, '/directory/filename');
  } catch (e) {
    errorMsg = e.message;
  }

  t.is(errorMsg, 'Unable to find resolving fn [fail] for wikilink [[fail:1234]] on page [/directory/filename]');
})

test('sets resolvingFnName on finding resolvingFn', t => {
  const parser = new WikilinkParser({
    resolvingFns: new Map([
      ['test', () => 'Hello World']
    ]),
  }, new Set(), new Map());

  const link = parser.parseSingle('[[test:1234]]', pageDirectory, '/directory/filename');

  t.is(link.resolvingFnName, 'test');
  t.is(link.name, '1234');
})

test('regex does not match on whitespace', t => {
  const deadLinks = new Set();
  const parser = new WikilinkParser(opts, deadLinks, new Map());
  t.is(parser.find("[[ broken \nwikilink ]]", pageDirectory, '/').length, 0);
  t.is(parser.find("[[ broken |wikilink \n]]", pageDirectory, '/').length, 0);
  t.is(parser.find("[[\n broken wikilink]]", pageDirectory, '/').length, 0);
})

test('regex does match special ASCII', t => {
  const deadLinks = new Set();
  const parser = new WikilinkParser(opts, deadLinks, new Map());
  t.is(parser.find("[[♡ cinni''s dream home ♡]]", pageDirectory, '/').length, 1);
  t.is(parser.find("[[♡ cinni''s dream home ♡|Cinni]]", pageDirectory, '/').length, 1);
  t.is(deadLinks.size, 0);
})

test('parses image wikilinks correctly', t => {
  const parser = new WikilinkParser({
    ...opts,
    imageExtensions: ['.png', '.jpg', '.jpeg', '.svg', '.gif']
  }, new Set(), new Map());

  const testCases = [
    {
      input: '![[image.png]]',
      expected: {
        name: 'image.png',
        title: null,
        isImage: true,
        isEmbed: true,
        resolvingFnName: 'default-image',
        href: 'image.png',
        exists: false
      }
    },
    {
      input: '![[image.png|500]]',
      expected: {
        name: 'image.png',
        title: '500',
        isImage: true,
        isEmbed: true,
        resolvingFnName: 'default-image',
        href: 'image.png',
        exists: false
      }
    },
    {
      input: '[[photo.JPG]]',
      expected: {
        name: 'photo.JPG',
        title: null,
        isImage: true,
        isEmbed: false,
        resolvingFnName: 'default-image',
        href: 'photo.JPG',
        exists: false
      }
    },
    {
      input: '[[User Diagram.png|Alt text]]',
      expected: {
        name: 'User Diagram.png',
        title: 'Alt text',
        isImage: true,
        isEmbed: false,
        resolvingFnName: 'default-image',
        href: 'User Diagram.png',
        exists: false
      }
    },
    {
      input: '[[document.pdf]]',
      expected: {
        name: 'document.pdf',
        title: null,
        isImage: false,
        isEmbed: false,
        resolvingFnName: 'default'
      }
    },
    {
      input: '![[animation.GIF|300]]',
      expected: {
        name: 'animation.GIF',
        title: '300',
        isImage: true,
        isEmbed: true,
        resolvingFnName: 'default-image',
        href: 'animation.GIF',
        exists: false
      }
    }
  ];

  testCases.forEach(({ input, expected }) => {
    const result = parser.parseSingle(input, pageDirectory);
    t.like(result, expected, `Failed for input: ${input}`);
  });
});

test('parses Stick Man SVG correctly', t => {
  const parser = new WikilinkParser(opts, new Set(), new Map());

  // Test simple SVG embed
  const simpleResult = parser.parseSingle('![[Stick Man.svg]]', pageDirectory);
  t.like(simpleResult, {
    name: 'Stick Man.svg',
    title: null,
    isImage: true,
    isEmbed: true,
    resolvingFnName: 'default-image',
    href: 'Stick Man.svg', // Should use filename as href
    exists: false
  });

  // Test SVG with width parameter
  const withWidthResult = parser.parseSingle('![[Stick Man.svg|100]]', pageDirectory);
  t.like(withWidthResult, {
    name: 'Stick Man.svg',
    title: '100',
    isImage: true,
    isEmbed: true,
    resolvingFnName: 'default-image',
    href: 'Stick Man.svg', // Should use filename as href
    exists: false
  });

  // Test that the defaultImageFn generates correct HTML with filenames
  const expectedSimpleHtml = '<img src="Stick Man.svg" alt="Stick Man.svg" />';
  const expectedWithWidthHtml = '<img src="Stick Man.svg" alt="Stick Man.svg" width="100" />';
  
  // Since we don't have the page/interlinker context in this test, we'll test the resolver function directly
  const defaultImageFn = opts.resolvingFns.get('default-image');
  
  return Promise.all([
    defaultImageFn(simpleResult, {}, {}).then(html => {
      t.is(html, expectedSimpleHtml);
    }),
    defaultImageFn(withWidthResult, {}, {}).then(html => {
      t.is(html, expectedWithWidthHtml);
    })
  ]);
});
