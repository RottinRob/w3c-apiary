'use strict';

/**
 * Simple JavaScript library to leverage the W3C API.
 *
 * @namespace Apiary
 */
(function(window) {

  // Pseudo-constants:
  var VERSION            = '0.5.0';
  var BASE_URL           = 'https://api.w3.org/';
  var USER_PROFILE_URL   = 'https://www.w3.org/users/';
  var APIARY_PLACEHOLDER = /^apiary\-([\w\-@]+)$/g;
  var APIARY_SELECTOR    = '[class^="apiary"]';
  var TYPE_DOMAIN_PAGE   = 1;
  var TYPE_GROUP_PAGE    = 2;
  var TYPE_USER_PAGE     = 3;
  var PHOTO_VALUE        = {
    large:     2,
    thumbnail: 1,
    tiny:      0
  };

  // “Global” variables:

  /**
   * API key, provided by the user.
   *
   * @alias apiKey
   * @memberOf Apiary
   */
  var apiKey;

  /**
   * Type of page; one of <code>TYPE_DOMAIN_PAGE</code>, <code>TYPE_GROUP_PAGE</code> or <code>TYPE_USER_PAGE</code>.
   *
   * @alias type
   * @memberOf Apiary
   */
  var type;

  /**
   * ID of the entity being used on the page.
   *
   * @alias id
   * @memberOf Apiary
   */
  var id;

  /**
   * Dictionary of placeholders found on the page, and all DOM elements associated to each one of them.
   *
   * @alias placeholders
   * @memberOf Apiary
   */
  var placeholders = {};

  /**
   * Simple cache of HTTP calls to the API, to avoid redundancy and save on requests.
   *
   * @alias cache
   * @memberOf Apiary
   */
  var cache = {};

  /**
   * Main function, invoked once after the document is completely loaded.
   *
   * @alias process
   * @memberOf Apiary
   */
  var process = function() {
    if (window.removeEventListener)
      window.removeEventListener('load', process);
    else if (window.detachEvent)
      window.detachEvent('onload', process);
    inferTypeAndId();
    if (apiKey && type && id) {
      findPlaceholders();
      getDataForType();
    } else {
      window.alert('Apiary ' + VERSION + '\n' +
        'ERROR: could not get all necessary metadata.\n' +
        'apiKey: “' + apiKey + '”\n' +
        'type: “' + type + '”\n' +
        'id: “' + id + '”');
    }
  };

  /**
   * Infer the type of page (domain, group…) and the ID of the corresponding entity; resolve API key.
   *
   * After this function is done, variables <code>apiKey</code>, <code>type</code> and <code>id</code> should have their right values set.
   *
   * @alias inferTypeAndId
   * @memberOf Apiary
   */
  var inferTypeAndId = function() {
    if (1 === document.querySelectorAll('html[data-api-key]').length) {
      apiKey = document.querySelectorAll('html[data-api-key]')[0].getAttribute('data-api-key');
    }
    if (document.querySelectorAll('[data-domain-id]').length > 0) {
      type = TYPE_DOMAIN_PAGE;
      id = document.querySelectorAll('[data-domain-id]')[0].getAttribute('data-domain-id');
    } else if (document.querySelectorAll('[data-group-id]').length > 0) {
      type = TYPE_GROUP_PAGE;
      id = document.querySelectorAll('[data-group-id]')[0].getAttribute('data-group-id');
    } else if (document.querySelectorAll('[data-user-id]').length > 0) {
      type = TYPE_USER_PAGE;
      id = document.querySelectorAll('[data-user-id]')[0].getAttribute('data-user-id');
    }
  };

  /**
   * Traverse the DOM in search of all elements with class <code>apiary-*</code>.
   *
   * After this function is done, <code>placeholders</code> should be an object containing all keys found in the DOM;
   * and for every key, an array of all elements mentioning that key.
   *
   * @example
   * {
   *   name: [
   *     <title> element,
   *     <h1> element
   *   ],
   *   lead: [<div> element],
   *   groups: [<div> element]
   * }
   *
   * @alias findPlaceholders
   * @memberOf Apiary
   */
  var findPlaceholders = function() {
    var candidates = document.querySelectorAll(APIARY_SELECTOR);
    var classes, match;
    for (var c = 0; c < candidates.length; c ++) {
      classes = candidates[c].classList;
      for (var i = 0; i < classes.length; i ++) {
        match = APIARY_PLACEHOLDER.exec(classes[i]);
        if (match) {
          if (!placeholders[match[1]]) {
            placeholders[match[1]] = [];
          }
          placeholders[match[1]].push(candidates[c]);
        }
      }
    }
  };

  /**
   * Get basic data for a particular entity from the W3C API, given a type of item and its value.
   *
   * @alias getDataForType
   * @memberOf Apiary
   */
  var getDataForType = function() {
    if (Object.keys(placeholders).length > 0) {
      if (TYPE_DOMAIN_PAGE === type) {
        get(BASE_URL + 'domains/' + id);
      } else if (TYPE_GROUP_PAGE === type) {
        get(BASE_URL + 'groups/' + id);
      } else if (TYPE_USER_PAGE === type) {
        get(BASE_URL + 'users/' + id);
      }
    }
  };

  /**
   * Crawl the API dynamically, traversing segments in placeholders.
   *
   * @param {Object} json JSON coming from an API call.
   *
   * @alias crawl
   * @memberOf Apiary
   */
  var crawl = function(json) {
    var i, keys, key, prefix, rest;
    keys = Object.keys(placeholders);
    for (key in keys) {
      i = keys[key];
      if (json.hasOwnProperty(i)) {
        if ('object' === typeof json[i] && 1 === Object.keys(json[i]).length && json[i].hasOwnProperty('href')) {
          get(json[i].href);
        } else {
          injectValues(i, json[i]);
        }
      } else if (i.indexOf('@') > -1) {
        prefix = i.substr(0, i.indexOf('@'));
        rest = i.substr(i.indexOf('@') + 1);
        Object.defineProperty(placeholders, rest, Object.getOwnPropertyDescriptor(placeholders, i));
        delete placeholders[i];
        crawl(json[prefix]);
      }
    }
  };

  /**
   * Inject values retrieved from the API into the relevant elements of the DOM.
   *
   * @param {String} key   ID of the placeholder.
   * @param {Object} value actual value for that piece of data.
   *
   * @alias injectValues
   * @memberOf Apiary
   */
  var injectValues = function(key, value) {
    var chunk;
    if ('string' === typeof value || 'number' === typeof value) {
      chunk = String(value);
    } else if (value instanceof Array) {
      chunk = getLargestPhoto(value);
      if (!chunk) {
        chunk = '<ul>';
        for (var i = 0; i < value.length; i ++) {
	  // @TODO: get rid of these special checks when there's a smarter algorithm for hyperlinks.
          if (value[i].hasOwnProperty('_links') && value[i]._links.hasOwnProperty('homepage') &&
            value[i]._links.homepage.hasOwnProperty('href') && value[i].hasOwnProperty('name')) {
            // It's a group.
            chunk += '<li><a href="' + value[i]._links.homepage.href + '">' + value[i].name + '</a></li>';
          } else if (value[i].hasOwnProperty('discr') && 'user' === value[i].discr &&
            value[i].hasOwnProperty('id') && value[i].hasOwnProperty('name')) {
            // It's a user.
            chunk += '<li><a href="' + USER_PROFILE_URL + value[i].id + '">' + value[i].name + '</a></li>';
          } else if (value[i].hasOwnProperty('shortlink') && value[i].hasOwnProperty('title')) {
            // It's a spec.
            chunk += '<li><a href="' + value[i].shortlink + '">' + value[i].title + '</a></li>';
          } else if (value[i].hasOwnProperty('name')) {
            chunk += '<li>' + value[i].name + '</li>';
          } else if (value[i].hasOwnProperty('title')) {
            chunk += '<li>' + value[i].title + '</li>';
          }
        }
        chunk += '</ul>';
      }
    } else if ('object' === typeof value) {
      if (value.hasOwnProperty('href')) {
        if (value.hasOwnProperty('name')) {
          chunk = '<a href="' + value.href + '">' + value.name + '</a>';
        }
      }
    }
    for (var i in placeholders[key]) {
      placeholders[key][i].innerHTML = chunk;
      placeholders[key][i].classList.add('apiary-done');
    }
    delete placeholders[key];
  };

  /**
   * GET data from the API, using the API key, and process the flattened version.
   *
   * @param {String} url target URL, including base URL and parameters, but not an API key.
   *
   * @alias get
   * @memberOf Apiary
   */
  var get = function(url) {
    var newUrl = url;
    if (-1 === newUrl.indexOf('?')) {
      newUrl += '?apikey=' + apiKey + '&embed=true';
    } else {
      newUrl += '&apikey=' + apiKey + '&embed=true';
    }
    if (cache.hasOwnProperty(newUrl)) {
      crawl(cache[newUrl]);
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', newUrl);
      xhr.addEventListener('loadend', function(event) {
        var result = JSON.parse(xhr.response);
        var i, j;
        for (i in {'_links': true, '_embedded': true}) {
          if (result.hasOwnProperty(i)) {
            for (j in result[i]) {
              if (result[i].hasOwnProperty(j)) {
                result[j] = result[i][j];
              }
            }
            delete result[i];
          }
        }
        cache[newUrl] = result;
        crawl(result);
      });
      xhr.send();
    }
  };

  /**
   * Find the largest photo available from an array of them, and return an IMG element.
   *
   * @param   {Array}  data list of photos provided.
   * @returns {String}      chunk of text corresponding to a new <code>&lt;img&gt;</code> node with the photo.
   *
   * @alias getLargestPhoto
   * @memberOf Apiary
   */
  var getLargestPhoto = function(data) {
    var largest, result;
    if (data && data.length > 0) {
      for (var i = 0; i < data.length; i ++) {
        if (data[i].href && data[i].name && (!largest || PHOTO_VALUE[data[i].name] > PHOTO_VALUE[largest.name])) {
          largest = data[i];
        }
      }
      if (largest) {
        result = '<img alt="Portrait" src="' + largest.href + '">';
      }
    }
    return result;
  };

  // Process stuff!
  if (window.addEventListener)
    window.addEventListener('load', process);
  else if (window.attachEvent)
    window.attachEvent('onload', process);

})(window);
