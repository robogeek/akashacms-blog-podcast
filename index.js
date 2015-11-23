/**
 * Copyright 2015 David Herron
 * 
 * This file is part of AkashaCMS-embeddables (http://akashacms.com/).
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

var path     = require('path');
var util     = require('util');
var url      = require('url');
var async    = require('async');

var logger;
var akasha;
var config;

/**
 * prepareConfig - Simplify the configuration object by filling in defaults
 *      that make sense for blogPodcast sites.
 */
module.exports.prepareConfig = function(akashacms, config) {
    
    if (!config) {
        config = {};
    }
    config = akashacms.prepareConfig(config);
    
    // If no config function, then set up a default set of plugins
    if (!config.config) {
        config.config = function(akasha) {
    		akasha.registerPlugins([
    			{ name: 'akashacms-breadcrumbs', plugin: require('akashacms-breadcrumbs') },
    			{ name: 'akashacms-embeddables', plugin: require('akashacms-embeddables') },
    			{ name: 'akashacms-blog-podcast', plugin: require('akashacms-blog-podcast') },
    			{ name: 'akashacms-social-buttons', plugin: require('akashacms-social-buttons') },
    			{ name: 'akashacms-base', plugin: require('akashacms-base') }
    		]);
        };
    }
    return config;
};

/**
 * startup - Simplify configuration for a Blog using Grunt
 */
module.exports.startup = function(akashacms, config) {
    
    module.exports.prepareConfig(akashacms, config);
    
    // Now that we've prepared the config object, call akashacms.config
    akashacms.config(config);
};

/**
 * Add ourselves to the config data.
 **/
module.exports.config = function(_akasha, _config) {
	akasha = _akasha;
	config = _config;
	logger = akasha.getLogger("blog-podcast");
    config.root_partials.push(path.join(__dirname, 'partials'));
    
	return module.exports;
};

var findBlogDocs = function(config, metadata, blogcfg) {
	var documents = akasha.findMatchingDocuments(blogcfg.matchers);
	
	documents.sort(function(a, b) {
		var aPublicationDate = Date.parse(
				a.frontmatter.yaml.publicationDate
			  ? a.frontmatter.yaml.publicationDate
			  : a.stat.mtime
		);
		var bPublicationDate = Date.parse(
				b.frontmatter.yaml.publicationDate
			  ? b.frontmatter.yaml.publicationDate
			  : b.stat.mtime
		);
		if (aPublicationDate < bPublicationDate) return -1;
		else if (aPublicationDate === bPublicationDate) return 0;
		else return 1;
	});
	documents.reverse();
	
	return documents;
};

module.exports.mahabhuta = [
	function($, metadata, dirty, done) {
		var elements = [];
		var documents, blogcfg;
		$('blog-news-river').each(function(i, elem) { elements.push(elem); });
		if (elements.length > 0) {
			blogcfg = config.blogPodcast[metadata.blogtag];
			if (!blogcfg) {
				return done(new Error('No blog configuration found for blogtag '+ metadata.blogtag));
			} else {
				documents = findBlogDocs(config, metadata, blogcfg);
			}
			// documents = findBlogDocs(config, metadata, blogcfg);
		}
		async.eachSeries(elements, function(element, next) {
			if (! metadata.blogtag) {
				next(new Error("no blogtag"));
			} else if (! config.blogPodcast.hasOwnProperty(metadata.blogtag)) {
				next(new Error("no blogPodcast item for "+ metadata.blogtag));
			}
			
			var maxEntries = $(element).attr('maxentries');
			
			// console.log(element.name +' '+ metadata.blogtag);
            
            var rssitems   = [];
			var documents2 = [];
			var count = 0;
            for (var q = 0; q < documents.length; q++, count++) {
                var doc = documents[q];
				// console.log('count='+ count +' maxEntries='+ maxEntries);
				if (typeof maxEntries === "undefined"
				|| (typeof maxEntries !== "undefined" && count < maxEntries)) {
					rssitems.push({
						title: doc.frontmatter.yaml.title,
						description: doc.frontmatter.yaml.teaser ? doc.frontmatter.yaml.teaser : "",
						url: config.root_url +'/'+ doc.renderedFileName,
						date: doc.frontmatter.yaml.publicationDate
							? doc.frontmatter.yaml.publicationDate
							: doc.stat.mtime
					});
					documents2.push(doc);
				} // else console.log('skipped');
            }
			
            var feedRenderTo = blogcfg.rssurl;
            akasha.generateRSS(blogcfg.rss, {
                    feed_url: config.root_url + feedRenderTo,
                    pubDate: new Date()
                },
                rssitems, feedRenderTo,	function(err) {
                    if (err) logger.error(err);
                });
            
            akasha.partial("blog-news-river.html.ejs", {
                documents: documents2,
                feedUrl: feedRenderTo
            },
            function(err, htmlRiver) {
                if (err) next(err);
                else {
                    $(element).replaceWith(htmlRiver);
                    next();
                }
            });
        },
        function(err) {
			if (err) done(err);
			else done();
		});
    },
	
	function($, metadata, dirty, done) {
		var elements = [];
		var documents;
		akasha.readDocumentEntry(metadata.documentPath, function(err, docEntry) {
			var blogcfg = config.blogPodcast[metadata.blogtag];
			$('blog-next-prev').each(function(i, elem) { elements.push(elem); });
			if (elements.length > 0) {
				if (!blogcfg) {
					return done(new Error('No blog configuration found for blogtag '+ metadata.blogtag));
				} else {
					documents = findBlogDocs(config, metadata, blogcfg);
				}
			}
			async.eachSeries(elements, function(element, next) {
				// what's the current document
				// find it within documents
				var docIndex = -1;
				for (var j = 0; j < documents.length; j++) {
					if (documents[j].path === docEntry.path) {
						docIndex = j;
					}
				}
				if (docIndex >= 0) {
					var prevDoc = docIndex === 0 ? documents[documents.length - 1] : documents[docIndex - 1];
					var nextDoc = docIndex === documents.length - 1 ? documents[0] : documents[docIndex + 1];
					akasha.partial('blog-next-prev.html.ejs', {
						prevDoc: prevDoc, nextDoc: nextDoc, thisDoc: docEntry, documents: documents
					}, function(err, html) {
						if (err) next(err);
						else {
							$(element).replaceWith(html);
							next();
						}
					});
				} else {
					next(new Error('did not find document in blog'));
				}
				// prevDoc =
				// nextDoc =
				// akasha.partial('blog-next-prev.html.ejs', {
				//		prevDoc: prevDoc, nextDoc: nextDoc
				// })
				// next();
			},
			function(err) {
				if (err) done(err);
				else done();
			});
		});
    }
];