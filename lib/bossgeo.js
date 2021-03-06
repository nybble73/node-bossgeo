var _ = require('underscore'),
    crypto = require('crypto'),
    bases = require('bases'),
    rest = require('restler');

function BossGeoClient(consumerKey, consumerSecret) {
    this.consumerKey = consumerKey;
    this.consumerSecret = consumerSecret;
}
var p = BossGeoClient.prototype;

// make an oauth 1.0a call
// does not currently support oauth tokens (although this would be easy to add)
p._makeRequest = function(method, baseUrl, args, cb) {
    if( !(_.isString(this.consumerKey) && this.consumerKey.length > 0) || !(_.isString(this.consumerSecret) && this.consumerSecret.length > 0) ){
        throw new Error('You must set the appropriate parameters to authenticate against BOSS Geo. Check your client and try again.');
    }

    args = _.extend(args, {
        'oauth_version': '1.0',
        'oauth_consumer_key': this.consumerKey,
        'oauth_nonce': randomStr(32),
        'oauth_signature_method': 'HMAC-SHA1',
        'oauth_timestamp': Math.floor(Date.now() / 1000).toString(),
        'format': 'json'
    });

    var qs = argsToEncodedData(args);
    var sig = method.toUpperCase() + '&' + encodeURIComponent(baseUrl) + '&' + encodeURIComponent(qs);
    var key = encodeURIComponent(this.consumerSecret) + '&';
    var hash = crypto.createHmac('sha1', key).update(sig).digest('base64');

    var opts = {
        method: method
    };
    rest.request(baseUrl + '?' + qs + '&oauth_signature=' + hash, opts).on('complete', function(result) {
        if (result instanceof Error) {
            cb(result, null);
        } else {
            cb(null, result);
        }
    });
};

p._handleBOSSResponse = function(rootPropertyName, errorIdMap, callback) {
    return function(err, res) {
        var errorCode;

        if (err) {
            callback(err, null);
            return;
        }

        try {
            res = JSON.parse(res)['bossresponse'];
        } catch(e) {
            return callback(new Error('Did not receive JSON in response.'), null);
        }

        if (!res['responsecode'] || (errorCode = parseInt(res['responsecode'])) !== 200) {
            if (errorIdMap.hasOwnProperty(errorCode)) {
                callback(new Error(errorIdMap[errorCode]), null);
            } else {
                callback(new Error('An unknown error occurred'), null);
            }
            return;
        }

        callback(null, res[rootPropertyName]);
    };
};

// placefinder error id -> string error description
// see http://developer.yahoo.com/boss/geo/docs/pf-errorcodes.html
var placefinderErrorNames = {
    1: 'Feature not supported',
    100: 'No input parameters',
    102: 'Address data not recognized as valid UTF-8',
    103: 'Insufficient address data',
    104: 'Unknown language',
    105: 'No country detected',
    106: 'Country not supported',
    107: 'Unput Parameter Too Long', //(sic)
    108: 'No Airport Found',
    109: 'No DMA Code Found',
    110: 'Error Geocoding IP Address',
    2001: 'Error With Neighborhoods',
    2002: 'Error With WOE',
    2003: 'Error With Results Sizes',
    '10NN': 'Internal problem detected'
};

// make a placefinder query
// for parameters, see http://developer.yahoo.com/boss/geo/docs/location-parameters.html
//  and http://developer.yahoo.com/boss/geo/docs/control-parameters.html
p.placefinder = function(params, cb) {
    // force json response
    if (params.hasOwnProperty('flags')) {
        params.flags = params.flags.replace(/j/gi, '') + 'J';
    } else {
        params.flags = 'J';
    }

    this._makeRequest(
        'GET',
        'http://yboss.yahooapis.com/geo/placefinder',
        params,
        this._handleBOSSResponse('placefinder', placefinderErrorNames, cb)
    );
};

// placespotter error id -> string error description
// see http://developer.yahoo.com/boss/geo/docs/response-errors.html
var placespotterErrorNames = {
    400: 'Bad Request: The appid parameter was invalid or not specified.',
    404: 'Not Found: The URI has no match in the display map.',
    413: 'Request Entity Too Large: There is currently a 50,000 byte limit for documents processed by PlaceSpotter. Documents above this length are rejected.',
    415: 'Unsupported Media Type: Document specified does not have a supported document type.',
    999: 'Unable to process request at this time: Your application is probably sending too many requests, too quickly. This can happen if you are batching requests.'
};

// make a placespotter query
// for parameters, see http://developer.yahoo.com/boss/geo/docs/placespotter_webservice.html
p.placespotter = function(params, cb) {
    // force plain json response
    params.outputType = 'json';
    if (params.hasOwnProperty('callback')) {
        delete params['callback'];
    }

    this._makeRequest(
        'GET',
        'http://yboss.yahooapis.com/geo/placespotter',
        params,
        this._handleBOSSResponse('placespotter', placespotterErrorNames, cb)
    );
};


// convert an object to query string, escaping keys and values, and sorting escaped keys lexigraphicly
function argsToEncodedData(args) {
    var escapedArgs = {}, keys = [], key, kvPairs = [];
    for (key in args) {
        key = encodeURIComponent(key);
        if (key in escapedArgs) {
            continue;
        }
        escapedArgs[key] = encodeURIComponent(args[key]);
        keys.push(key);
    }

    keys = keys.sort();
    for (var idx in keys) {
        key = keys[idx];
        kvPairs.push(key + '=' + escapedArgs[key]);
    }

    return kvPairs.join('&');
}

// see https://gist.github.com/3095925
function randomStr(length) {
    var maxNum = Math.pow(62, length);
    var numBytes = Math.ceil(Math.log(maxNum) / Math.log(256));
    if (numBytes === Infinity) {
        throw new Error('Length too large; caused overflow: ' + length);
    }

    do {
        var bytes = crypto.randomBytes(numBytes);
        var num = 0
        for (var i = 0; i < bytes.length; i++) {
            num += Math.pow(256, i) * bytes[i];
        }
    } while (num >= maxNum);

    return bases.toBase62(num);
}

exports.BossGeoClient = BossGeoClient;
