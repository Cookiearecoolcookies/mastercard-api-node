var connectorClass = require('../../common/Connector');
var environmentClass = require('../../common/Environment');
var urlUtil = require('../../common/URLUtil');

const PRODUCTION_URL = 'https://api.mastercard.com/merchantid/v1/merchantid?Format=';
const SANDBOX_URL = 'https://sandbox.api.mastercard.com/merchantid/v1/merchantid?Format=';

var responseType = 'XML';

function MerchantIdentifierService(consumerKey, privateKey, environment, callback){

    this._connector = new connectorClass.Connector(consumerKey, privateKey, callback);
    this._environment = environment;

    this.setCallback = function(callback){
        this._connector.setCallback(callback);
    };

    this.getMerchantIds = function(options){
        var url = this.getUrl(options);
        return this._connector.doRequest(url,'GET');
    };

    this.getUrl = function(options){
        var url = "";
        if (this._environment == environmentClass.production){
            url = PRODUCTION_URL + responseType.toUpperCase();
        } else {
            url = SANDBOX_URL + responseType.toUpperCase();
        }
        url = urlUtil.addQueryParameter(url, "MerchantId", options.MerchantId);
        url = urlUtil.addQueryParameter(url, "Type", options.Type);
        console.log(url);
        return url;
    };

}

module.exports.MerchantIdentifierService = MerchantIdentifierService;
module.exports.setResponseType = function(_type){
    responseType = _type || 'xml';
};

