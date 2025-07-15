import fs from 'node:fs';
import path from 'node:path';

export default class WikilinkParser {
  /**
   * This regex finds all WikiLink style links: [[id|optional text]] as well as WikiLink style embeds: ![[id]]
   *
   * @type {RegExp}
   */
  wikiLinkRegExp = /(?<!!)(!?)\[\[([^|\n]+?)(\|([^\n]+?))?]]/g;

  /**
   * Check if a filename is an image file by extension
   * @param {string} filename
   * @return {boolean}
   */
  isImageFile(filename) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
    return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  }

  /**
   * Find an image file in the filesystem
   * @param {string} imagePath - The image path to look for
   * @param {string} baseDir - The base directory to search from
   * @param {string|undefined} filePathStem - The current file path stem for relative lookups
   * @return {Object|null} - Returns {exists: boolean, href: string, fullPath: string} or null
   */
  findImageFile(imagePath, baseDir, filePathStem) {
    // Handle absolute paths starting with /
    if (imagePath.startsWith('/')) {
      const fullPath = path.join(baseDir, imagePath.substring(1));
      const exists = fs.existsSync(fullPath);
      return {
        exists,
        href: imagePath,
        fullPath
      };
    }

    // Handle relative paths (./ or ../)
    if (imagePath.startsWith('./') || imagePath.startsWith('../')) {
      if (!filePathStem) return null;
      
      const currentDir = path.dirname(filePathStem);
      const fullPath = path.resolve(path.join(baseDir, currentDir), imagePath);
      const exists = fs.existsSync(fullPath);
      const relativePath = path.relative(baseDir, fullPath);
      
      return {
        exists,
        href: '/' + relativePath.replace(/\\/g, '/'),
        fullPath
      };
    }

    // Handle simple filename - search in current directory and baseDir recursively
    const searchPaths = [];
    
    // First try current directory if we have filePathStem
    if (filePathStem) {
      const currentDir = path.dirname(filePathStem);
      searchPaths.push(path.join(baseDir, currentDir, imagePath));
    }
    
    // Then try base directory
    searchPaths.push(path.join(baseDir, imagePath));
    
    // Search for the file recursively in subdirectories
    const findFileRecursively = (dir, filename) => {
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          
          if (stat.isFile() && file === filename) {
            return fullPath;
          } else if (stat.isDirectory()) {
            const found = findFileRecursively(fullPath, filename);
            if (found) return found;
          }
        }
      } catch (e) {
        // Ignore errors accessing directories
      }
      return null;
    };

    for (const searchPath of searchPaths) {
      if (fs.existsSync(searchPath)) {
        const relativePath = path.relative(baseDir, searchPath);
        return {
          exists: true,
          href: '/' + relativePath.replace(/\\/g, '/'),
          fullPath: searchPath
        };
      }
    }
    
    // If not found in direct paths, search recursively
    const foundPath = findFileRecursively(baseDir, imagePath);
    if (foundPath) {
      const relativePath = path.relative(baseDir, foundPath);
      return {
        exists: true,
        href: '/' + relativePath.replace(/\\/g, '/'),
        fullPath: foundPath
      };
    }

    return null;
  }

  /**
   * @param { import('@photogabble/eleventy-plugin-interlinker').EleventyPluginInterlinkOptions } opts
   * @param { DeadLinks } deadLinks
   * @param { Map } linkCache
   */
  constructor(opts, deadLinks, linkCache) {
    this.opts = opts;
    this.deadLinks = deadLinks;
    this.linkCache = linkCache;
    this.inputDir = process.cwd(); // Default to current working directory
  }

  /**
   * Set the input directory for image file lookups
   * @param {string} inputDir
   */
  setInputDir(inputDir) {
    this.inputDir = inputDir;
  }

  /**
   * Parses a single WikiLink into the link object understood by the Interlinker.
   *
   * @param {string} link
   * @param {import('@photogabble/eleventy-plugin-interlinker').PageDirectoryService} pageDirectory
   * @param {string|undefined} filePathStem
   * @return {import('@photogabble/eleventy-plugin-interlinker').WikilinkMeta}
   */
  parseSingle(link, pageDirectory, filePathStem = undefined) {
    if (this.linkCache.has(link)) {
      return this.linkCache.get(link);
    }

    // Wikilinks starting with a ! are considered Embeds e.g. `![[ ident ]]`
    const isEmbed = link.startsWith('!');

    // By default, we display the linked page's title (or alias if used for lookup). This can be overloaded by
    // defining the link text prefixed by a | character, e.g. `[[ ident | custom link text ]]`
    const parts = link.slice((isEmbed ? 3 : 2), -2).split("|").map(part => part.trim());

    /** @var {import('@photogabble/eleventy-plugin-interlinker').WikilinkMeta} */
    const meta = {
      title: parts.length === 2 ? parts[1] : null,
      // Strip .md and .markdown extensions from the file ident; this is so it can be used for
      // filePathStem match if path lookup.
      name: parts[0].replace(/.(md|markdown)\s?$/i, ""),
      anchor: null,
      link,
      isEmbed,
      isPath: false,
      exists: false,
      resolvingFnName: isEmbed ? 'default-embed' : 'default',
      isImage: false,
    };

    ////
    // Anchor link identification:
    // This works similar to Obsidian.md except this doesn't look ahead to check if the referenced anchor exists.
    // An anchor link can be referenced by a # character in the file ident, e.g. `[[ ident#anchor-id ]]`.
    //
    // This supports escaping by prefixing the # with a /, e.g `[[ Page about C/# ]]`

    if (meta.name.includes('#')) {
      const nameParts = parts[0].split('#').map(part => part.trim());
      // Allow for escaping a # when prefixed with a /
      if (nameParts[0].at(-1) !== '/') {
        meta.name = nameParts[0];
        meta.anchor = nameParts[1];
      } else {
        meta.name = meta.name.replace('/#', '#');
      }
    }

    ////
    // Path link identification:
    // This supports both relative links from the linking files path and lookup from the project root path.
    meta.isPath = (meta.name.startsWith('/') || meta.name.startsWith('../') || meta.name.startsWith('./'));

    // This is a relative path lookup, need to mutate name so that its absolute path from project
    // root so that we can match it on a pages filePathStem.
    if (meta.isPath && meta.name.startsWith('.')) {
      if (!filePathStem) throw new Error('Unable to do relative path lookup of wikilink.');

      const cwd = filePathStem.split('/');
      const relative = meta.name.split('/');
      const stepsBack = relative.filter(file => file === '..').length;

      meta.name = [
        ...cwd.slice(0, -(stepsBack + 1)),
        ...relative.filter(file => file !== '..' && file !== '.')
      ].join('/');
    }

    ////
    // Custom Resolving Fn:
    // If the author has referenced a custom resolving function via inclusion of the `:` character
    // then we use that one. Otherwise, use the default resolving functions.
    // As with anchor links, this supports escaping the `:` character by prefixing with `/`

    if (meta.name.includes(':')) {
      const parts = meta.name.split(':').map(part => part.trim());
      if (parts[0].at(-1) !== '/') {
        if (!this.opts.resolvingFns || this.opts.resolvingFns.has(parts[0]) === false) {
          const {found} = pageDirectory.findByLink(meta);
          if (!found) throw new Error(`Unable to find resolving fn [${parts[0]}] for wikilink ${link} on page [${filePathStem}]`);
        } else {
          meta.resolvingFnName = parts[0];
          meta.name = parts[1];
        }
      } else {
        meta.name = meta.name.replace('/:', ':');
      }
    }

    // Check if this is an image embed
    if (isEmbed && this.isImageFile(meta.name)) {
      meta.isImage = true;
      meta.resolvingFnName = 'image-embed';
      
      // Try to find the image file in the filesystem
      const imageResult = this.findImageFile(meta.name, this.inputDir, filePathStem);
      
      if (imageResult && imageResult.exists) {
        meta.exists = true;
        meta.href = imageResult.href;
        meta.path = imageResult.fullPath;
        
        // Set default title to filename without extension if no title provided
        if (!meta.title) {
          meta.title = path.basename(meta.name, path.extname(meta.name));
        }
      } else {
        // Image not found, treat as dead link
        this.deadLinks.add(link);
        meta.href = this.opts.stubUrl;
        meta.resolvingFnName = '404-embed';
      }
    }

    // Lookup page data from 11ty's collection to obtain url and title if currently null
    // Skip page lookup for images since they are already handled above
    if (!meta.isImage) {
      const {page, foundByAlias} = pageDirectory.findByLink(meta);
      if (page) {
        if (foundByAlias) {
          meta.title = meta.name;
        } else if (meta.title === null && page.data.title) {
          meta.title = page.data.title;
        }
        meta.href = page.url;
        meta.path = page.inputPath;
        meta.exists = true;
        meta.page = page;
      } else if (['default', 'default-embed'].includes(meta.resolvingFnName)) {
        // If this wikilink goes to a page that doesn't exist, add to deadLinks list and
        // update href for stub post.
        this.deadLinks.add(link);
        meta.href = this.opts.stubUrl;

        if (isEmbed) meta.resolvingFnName = '404-embed';
      }
    }

    // Cache discovered meta to link, this cache can then be used by the Markdown render rule
    // to display the link.
    this.linkCache.set(link, meta);

    return meta;
  }

  /**
   * @param {Array<string>} links
   * @param {import('@photogabble/eleventy-plugin-interlinker').PageDirectoryService} pageDirectory
   * @param {string|undefined} filePathStem
   * @return {Array<import('@photogabble/eleventy-plugin-interlinker').WikilinkMeta>}
   */
  parseMultiple(links, pageDirectory, filePathStem) {
    return links.map(link => this.parseSingle(link, pageDirectory, filePathStem));
  }

  /**
   * Finds all wikilinks within a document (HTML or otherwise) and returns their
   * parsed result.
   *
   * @param {string} document
   * @param {import('@photogabble/eleventy-plugin-interlinker').PageDirectoryService} pageDirectory
   * @param {string|undefined} filePathStem
   * @return {Array<import('@photogabble/eleventy-plugin-interlinker').WikilinkMeta>}
   */
  find(document, pageDirectory, filePathStem) {
    return this.parseMultiple(
      (document.match(this.wikiLinkRegExp) || []),
      pageDirectory,
      filePathStem
    )
  }
}
