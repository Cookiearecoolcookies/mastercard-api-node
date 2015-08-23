OAUTH_PARMS_CLASS = require('../common/OAuthParameters');
PARSE_STRING = require('xml2js').parseString;
var util = require('util');
var namespaceUtil = require('../common/NamespaceUtil');

AMP = '&';
OAUTH_START_STRING = 'OAuth ';
ERROR_STATUS_BOUNDARY = 300;
USER_AGENT = 'MC API OAuth Framework v1.0-node';

CRYPTO = require('crypto');
HTTPS = require('https');
FS = require('fs');
URL = require('url');
QUERYSTRING = require('querystring');
XML2JS = require('xml2js');

OAUTH_BODY_HASH = 'oauth_body_hash';
OAUTH_CONSUMER_KEY = 'oauth_consumer_key';
OAUTH_NONCE = 'oauth_nonce';
OAUTH_SIGNATURE = 'oauth_signature';
OAUTH_SIGNATURE_METHOD = 'oauth_signature_method';
OAUTH_TIMESTAMP = 'oauth_timestamp';
OAUTH_VERSION = 'oauth_version';

const SSL_CERT_FILE = './common/SSLCerts/EnTrust/cacert.pem';

/**
 * Constructor
 * @param consumerKey - consumer key provided by MasterCard
 * @param privateKey - path to private key //TODO UPDATE WHEN REFACTORED
 * @constructor -
 */

function Connector(consumerKey, privateKey, callback){

  this.consumerKey = consumerKey;
  this.privateKey = privateKey;
  this.callback = callback;

  this.setCallback = function(callback){
    this.callback = callback;
  };

  /**
   * Method that service classes should call in order to execute a request against MasterCard's servers
   * @param url - URL including querystring parameters to connect to
   * @param requestMethod - GET, PUT, POST, or DELETE
   * @param body - request body [optional]
   * @param oauth_parms - existing oauth_parameters [optional]
   */

  this.doRequest = function(url, requestMethod, bodyObject, oauthParms){

    if (!this.callback){
      this.callback = function(response){ return response; };
    }

    if (oauthParms){
      //TODO allow for additional parms to be added
    } else {
      oauthParms = new OAUTH_PARMS_CLASS.OAuthParameters(this.consumerKey);
    }

    if (bodyObject){
      var builder = new XML2JS.Builder();
      var body = builder.buildObject(bodyObject);
      body = namespaceUtil.AddNamespace(body);
      oauthParms.generateBodyHash(body);
    }

    var signatureBaseString = _generateSignatureBaseString(url, requestMethod, oauthParms);
    signatureBaseString = _postProcessSignatureBaseString(signatureBaseString);
    _signAndMakeRequest(oauthParms, this.privateKey, signatureBaseString, requestMethod, url, body, this.callback);

  };
}

// CLASS METHODS

/**
 * "private method" to generate the signature base string from the URL, request method, and parameters
 * @param url - URL to connect to
 * @param requestMethod - HTTP request method
 * @param oauthParms - parameters containing authorization information
 * @returns {string|*} - signature base string generated
 * @private
 */

_generateSignatureBaseString = function(url, requestMethod, oauthParms){
  var signatureBaseString = encodeURIComponent(requestMethod.toUpperCase()) +
    AMP + encodeURIComponent((_normalizeUrl(url))) + AMP +
    encodeURIComponent(_normalizeParameters(url, oauthParms));
  return signatureBaseString;
};

/**
 * "private" method to sign the signature base string and connect to MasterCard's servers
 * @param oauthParms - parameters containing authorization information
 * @param privateKey - URSA private key object
 * @param requestMethod -
 * @param url -
 * @param body - request body [optional]
 * @private
 */

_signAndMakeRequest = function(oauthParms, privateKey, signatureBaseString, requestMethod, url, body, callback){
  var signer = CRYPTO.createSign('RSA-SHA1');
  signer = signer.update(new Buffer(signatureBaseString));
  oauthParms.signature = signer.sign(privateKey, 'base64');
  oauthParms.signature = encodeURIComponent(oauthParms.signature);
  oauthParms.signature = oauthParms.signature.replace('+','%20');
  oauthParms.signature = oauthParms.signature.replace('*','%2A');
  oauthParms.signature = oauthParms.signature.replace('~','%7E');
  var authHeader = _buildAuthHeaderString(oauthParms);
  _doConnect(url,requestMethod,authHeader, body, callback);
};

/**
 * "private" method to build the authorization header from the contents of the oauth parameters
 * @param oauthParms - object containing authorization information
 * @returns {string} - authorization header
 * @private
 */

_buildAuthHeaderString = function(oauthParms){
  var header = '';
  header = header + 'oauth_consumer_key' + '="' + oauthParms.consumerKey + '",';
  header = header + 'oauth_nonce' + '="' + oauthParms.nonce + '",';
  header = header + 'oauth_signature' + '="' + oauthParms.signature + '",';
  header = header + 'oauth_signature_method' + '="' + oauthParms.signatureMethod + '",';
  header = header + 'oauth_timestamp' + '="' + oauthParms.timeStamp + '",';
  header = header + 'oauth_version' + '="' + oauthParms.oauthVersion + '"';
  if (oauthParms.bodyHash){
    header = OAUTH_START_STRING + OAUTH_BODY_HASH
      + '="' + oauthParms.bodyHash + '",' + header;
  } else {
    header = OAUTH_START_STRING + header;
  }
  return header;
};

/**
 * "private" method to make the connection to MasterCard's servers
 * @param url - url to connect to
 * @param requestMethod - HTTP request method ('GET','PUT','POST','DELETE'
 * @param body - request body [optional]
 * @private
 */

_doConnect = function(url, requestMethod, authHeader, body, callback){
  requestMethod = requestMethod.toUpperCase();
  uri = URL.parse(url);
  var options;
  if (body) {
    options = {
      hostname: uri.host.split(':')[0],
      path: uri.path,
      method: requestMethod,
      headers: {
        'Authorization': authHeader,
        'User-Agent': USER_AGENT,
        'content-type' : 'application/xml;charset=UTF-8',
        'content-length' : body.length
      },
        cert: FS.readFileSync(SSL_CERT_FILE)
    };
  } else {
    options = {
      hostname: uri.host.split(':')[0],
      path: uri.path,
      method: requestMethod,
      headers: {
        'Authorization': authHeader,
        'User-Agent': USER_AGENT
      },
        cert: FS.readFileSync(SSL_CERT_FILE)
    }
  }

    options.agent = new HTTPS.Agent(options);

  var request = HTTPS.request(options, function(response){
    var retBody = '';
    var statusCode = response.statusCode;
    response.on('data', function(chunk){
      retBody += chunk;
    }).on('end', function(){
      _checkResponse(retBody, statusCode, callback);
    });
  }).on('error', function(error){
      throw new Error(error);
    });

    if (body) {
        request.write(body);
    }
  request.end();
};

_checkResponse = function(body, statusCode, callback){
  if (statusCode > ERROR_STATUS_BOUNDARY){
    throw new Error(body);
  } else {
      body = namespaceUtil.RemoveNamespace(body);
    PARSE_STRING(body, function(err, result){
      callback(result);
    });
  }
};

/**
 * "private" method to strip off the querystring parameters and port from the URL
 * @param url - url to modify
 * @returns {*} - normalized URL
 * @private
 */

_normalizeUrl = function(url){
  var tmp = url;
  // strip query portion
  var idx = url.indexOf('?');
  if (idx){
    tmp = url.substr(0, idx);
  }
  // strip port
  if (tmp.lastIndexOf(':') && tmp.lastIndexOf(':') > 5){
    // implies port is given
    tmp = tmp.substr(0, tmp.lastIndexOf(':'));
  }
  return tmp;
};

/**
 * "private" method to put querystring and oauth parameters in lexical order
 * @param url - url containing query string parameters
 * @param oauthParms - object containing authorization info
 * @returns {string} - normalized parameter string
 * @private
 */

_normalizeParameters = function(url, oauthParms){
  var uri = URL.parse(url);
  // all mastercard services have ?Format=XML
  var qstringHash = QUERYSTRING.parse(uri.search.split('?')[1]);
  var oauthHash = oauthParms.generateParametersHash();
  var nameArr = [];
  var idx = 0;
  // TODO Does this need to be concatenated into one array qstringhash.concat(oauthHash)
  for (var qStringKey in qstringHash){
    nameArr[idx] = qStringKey;
    idx++;
  }
  for (var oauthKey in oauthHash){
    nameArr[idx] = oauthKey;
    idx++;
  }

  nameArr.sort(); // now parms are in alphabetical order

  var parm = '';
  var delim = '';
  for (var i = 0; i < nameArr.length ; i++){
    if (qstringHash[nameArr[i]]){
      parm = parm + delim + nameArr[i] + '=' + qstringHash[nameArr[i]];
    } else {
      parm = parm + delim + nameArr[i] + '=' + oauthHash[nameArr[i]];
    }
    delim = AMP;
  }
  return parm;
};

_postProcessSignatureBaseString = function(signatureBaseString){
  signatureBaseString = signatureBaseString.replace(/%20/g, '%2520');
  return  signatureBaseString.replace('!','%21');
};

module.exports.Connector = Connector;