import {install} from '../src/markdown-ext.js';
import WikilinkParser from '../src/wikilink-parser.js';
import {fileURLToPath} from "node:url";
import {normalize} from './helpers.js';
import MarkdownIt from 'markdown-it';
import path from "node:path";
import fs from 'node:fs';
import test from 'ava';

const opts = {
  imageExtensions: ['.png', '.svg', '.jpg', '.jpeg']
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('inline rule correctly parses single wikilink', t => {
  const wikilinkParser = new WikilinkParser(opts, new Set(), new Map());

  wikilinkParser.linkCache.set('[[wiki link]]', {
    title: 'Wiki Link',
    link: '[[wiki link]]',
    href: '/wiki-link/',
    content: '<a href="/wiki-link/">Wiki Link</a>',
    isEmbed: false,
  });

  const md = MarkdownIt({html: true});
  install(md, wikilinkParser);

  t.is(
    "<p>Hello world, this is some text with a <a href=\"/wiki-link/\">Wiki Link</a> inside!</p>\n",
    md.render('Hello world, this is some text with a [[wiki link]] inside!', {})
  );
});

test('inline rule correctly parses multiple wikilinks', t => {
  const wikilinkParser = new WikilinkParser(opts, new Set(), new Map());

  wikilinkParser.linkCache.set('[[wiki link]]', {
    title: 'Wiki Link',
    link: '[[wiki link]]',
    href: '/wiki-link/',
    content: '<a href="/wiki-link/">Wiki Link</a>',
    isEmbed: false,
  });

  wikilinkParser.linkCache.set('[[another wiki link]]', {
    title: 'Another Wiki Link',
    link: '[[another wiki link]]',
    href: '/another-wiki-link/',
    content: '<a href="/another-wiki-link/">Another Wiki Link</a>',
    isEmbed: false,
  });

  const md = MarkdownIt({html: true});
  install(md, wikilinkParser);

  t.is(
    "<p>Hello world, this is some text with a <a href=\"/wiki-link/\">Wiki Link</a> inside! There is also <a href=\"/another-wiki-link/\">Another Wiki Link</a> in the same string.</p>\n",
    md.render('Hello world, this is some text with a [[wiki link]] inside! There is also [[another wiki link]] in the same string.', {})
  );
});

test('inline rule correctly parses single embed', t => {
  const wikilinkParser = new WikilinkParser(opts, new Set(), new Map());

  wikilinkParser.linkCache.set('![[wiki-embed]]', {
    title: 'Wiki Embed',
    href: '/wiki-embed/',
    link: '![[wiki-embed]]',
    content: '<span>Wiki Embed Test</span>',
    isEmbed: true,
  });

  const md = MarkdownIt({html: true});
  install(md, wikilinkParser);

  t.is(
    md.render('Hello world this is a ![[wiki-embed]]'),
    "<p>Hello world this is a <span>Wiki Embed Test</span></p>\n"
  );
});

test('inline rule correctly parses image', t => {
  const wikilinkParser = new WikilinkParser(opts, new Set(), new Map());

  wikilinkParser.linkCache.set('![[wiki-image.png]]', {
    title: 'Wiki Image',
    href: 'wiki-image.png',
    link: '![[wiki-image.png]]',
    content: '<img src="wiki-image.png" alt="Wiki Image" />',
    isEmbed: false,
    isImage: true,
  });

  const md = MarkdownIt({html: true});
  install(md, wikilinkParser);

  t.is(
    md.render('Hello world this is a ![[wiki-image.png]]'),
    "<p>Hello world this is a <img src=\"wiki-image.png\" alt=\"Wiki Image\" /></p>\n"
  );
});

test('inline rule ignores wikilink within code and pre tags', t => {
  const wikilinkParser = new WikilinkParser(opts, new Set(), new Map());

  wikilinkParser.linkCache.set('[[wiki link]]', {
    title: 'Wiki Link',
    link: '[[wiki link]]',
    href: '/wiki-link/',
    content: '<a href="/wiki-link/">Wiki Link</a>',
    isEmbed: false,
  });

  const md = MarkdownIt({html: true});
  install(md, wikilinkParser);

  const markdown = fs.readFileSync(__dirname + '/fixtures/within-code.md', {encoding:'utf8', flag:'r'});
  const html = fs.readFileSync(__dirname + '/fixtures/within-code.html', {encoding:'utf8', flag:'r'});

  t.is(
    normalize(md.render(markdown)),
    normalize(html)
  );
});

test('inline rule correctly parses mixed wikilink and embed in multiline input', t => {
  const wikilinkParser = new WikilinkParser(opts, new Set(), new Map());

  wikilinkParser.linkCache.set('![[inline embed]]', {
    title: 'Inline Embed',
    link: '![[inline embed]]',
    href: '/inline-embed/',
    content: '<span>inline embed</span>',
    isEmbed: true,
  });

  wikilinkParser.linkCache.set('![[this is an embed on its own]]', {
    title: 'This is an embed on its own',
    link: '![[this is an embed on its own]]',
    href: '/lonely-embed/',
    content: '<div>Embed on its own</div>',
    isEmbed: true,
  });

  wikilinkParser.linkCache.set('[[wiki link]]', {
    title: 'Wiki Link',
    link: '[[wiki link]]',
    href: '/wiki-link/',
    content: '<a href="/wiki-link/">Wiki Link</a>',
    isEmbed: false,
  });

  wikilinkParser.linkCache.set('[[wiki link|Wikilinks]]', {
    title: 'Wikilinks',
    link: '[[wiki link|Wikilinks]]',
    href: '/wiki-link/',
    content: '<a href="/wiki-link/">Wikilinks</a>',
    isEmbed: false,
  });

  const md = MarkdownIt({html: true});
  install(md, wikilinkParser);

  const markdown = fs.readFileSync(__dirname + '/fixtures/multiline.md', {encoding:'utf8', flag:'r'});
  const html = fs.readFileSync(__dirname + '/fixtures/multiline.html', {encoding:'utf8', flag:'r'});

  t.is(
    normalize(md.render(markdown)),
    normalize(html)
  );
});
