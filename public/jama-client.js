const rateLimit = require("axios-rate-limit");
const https = require("https");
const http = require("http");
const axios = require("axios").default;
const qs = require("querystring");
const debug = false;
const log = require("electron-log");
var object = require("lodash/fp/object");

/**
 * Create a new client for the Jama Connect REST API.
 *
 * @param {String} baseURL Base URL for your jama instance
 * @param {String} username Username or ClientID
 * @param {String} password Password or ClientSecret
 * @param {String} authMode must be either "basic" or "oauth"
 * @param {Object} options options object containing settings to customize client
 * @param {Number} options.maxResults  The maximum number of results to fetch per page.  Cannot be greater than 50, enforced by API.
 * @param {String} options.apiVersion options.apiVersion Currently only '/api/v1" is supported.
 * @param {Number} options.maxRPS options.maxRPS The maximum number of requests per second to make. Choose a value between 1-15.
 * @param {boolean} options.verifySSL Set this to false to allow the use of self signed SSL certificates.
 * @returns {Object} JamaClient object to facilitate communication with the Jama Connect instance
 */
class JamaClient {
  constructor(
    baseURL,
    username,
    password,
    authMode,
    { maxResutls = 50, apiVersion = "/rest/v1", maxRPS = 10, verifySSL = true }
  ) {
    // Validate options: if outside valid range set to defaults.
    if (maxResutls < 1) this._maxResutls = 1;
    else if (maxResutls > 50) this._maxResutls = 50;
    else this._maxResults = maxResutls;

    if (maxRPS < 1) this._maxRPS = 1;
    else if (maxRPS > 15) this._maxRPS = 15;
    else this._maxRPS = maxRPS;

    if (apiVersion !== "/rest/v1" && apiVersion !== "/rest/labs") {
      log.warn(
        "Invalid apiVersion string supplied.  Applying default: '/rest/v1'"
      );
      this._apiVersion = "/rest/v1";
    } else this._apiVersion = apiVersion;

    if (authMode !== "basic" && authMode !== "oauth") {
      log.error(
        `Invalid selection authMode must be one of ['basic', 'oauth'].  Provided: ${authMode}`
      );
      throw new Error("Invalid authMode provided");
    }

    // Setup Auth variables
    this._authMode = authMode;
    this._username = username;
    this._password = password;

    // Build / validate baseURL and set API and OAUTH URLS
    if (baseURL.indexOf("https://") === 0 || baseURL.indexOf("http://") === 0) {
      this._baseURL = baseURL;
    } else {
      this._baseURL = "https://" + baseURL;
    }
    this._apiURL = this._baseURL + this._apiVersion;
    this._oauthURL = this._baseURL + "/rest/oauth/token";

    // Prepare clientConfig for Axios client
    this._axiosClientConfig = {
      baseURL: this._apiURL,
      httpsAgent: new https.Agent({
        keepAlive: true,
        rejectUnauthorized: verifySSL,
      }),
      httpAgent: new http.Agent({
        keepAlive: true,
        rejectUnauthorized: verifySSL,
      }),
    };

    if (this._authMode === "basic") {
      this._axiosClientConfig.auth = {
        username: this._username,
        password: this._password,
      };
    }

    // Create client
    this.client = rateLimit(axios.create(this._axiosClientConfig), {
      maxRPS: maxRPS,
    });
  } // end constructor

  // Ensure we have a valid oAuth bearer token
  async checkOAuthToken() {
    // If running in OAuth mode, we need to ensure we have a valid bearer token.
    if (this._authMode === "oauth") {
      // Check to see if we have a token yet
      if (this._oAuthToken === undefined) {
        await this.getFreshToken();
      }
      // If we do have a token, Check to see if it has expired.
      else {
        let timeElapsed = Date.now() - this._tokenAquiredAt; // Time elapsed since token acquisition in microseconds.
        let timeRemaining = this._tokenExpiresIn - timeElapsed; // Number of microseconds until token expires.

        // If time remaining is less than 1 minute refresh the token. 1 min * 60s/min * 1000milliseconds/second = 60000
        if (timeRemaining < 60000) await this.getFreshToken();
      }
    }
  }

  // Fetch a new OAuth Bearer token and apply it to the headers.
  async getFreshToken() {
    log.info("Fetching fresh oAuth bearer token");
    // Get system time before making request for token so that we always think the token expires slightly before it actually does.
    let timeTokenAquired = Date.now();
    let that = this;
    await this.client
      .post(
        "rest/oauth/token", // path for token server
        qs.stringify({
          grant_type: "client_credentials", // Passed into Data section of post
        }),
        // The rest is a config object for the request.
        {
          baseURL: this._baseURL,
          auth: {
            username: this._username,
            password: this._password,
          },
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      )
      .then(function (response) {
        // Set token aquisition time
        that._tokenAquiredAt = timeTokenAquired;
        that._tokenExpiresIn = response.data.expires_in * 1000;
        log.info(
          "oAuth token valid for {" + response.data.expires_in + "} seconds."
        );

        // Set token into headers.
        that._oAuthToken = response.data.access_token;
        axios.defaults.headers.common[
          "Authorization"
        ] = `Bearer ${that._oAuthToken}`;

        log.info("Updated oAuth token.");
      })
      .catch(function (error) {
        that.errorLogger(error, "getOAuthToken");
        log.error(`Failed to update oAuth token: ${error.message}`);
      });
  }

  /**
   * Fetch a single page from the API.
   *
   * @param {String} path The resource string to be fetched does not start with a '/'  i.e. "projects" or "filters/42/resutls"
   * @param {String} params Optional object of parameters to add as a query string to the request.
   * @returns {Promise} Returns a promise that on success contains the Data segment of the call, on failure it returns the whole error object.
   */
  async getSinglePage(path, params) {
    params = this._validateParams(params);

    // Params should be a valid URLSearchParams Object at this point. Go ahead and process required headers.
    if (!params.has("maxResults")) params.set("maxResults", this._maxResults);

    // Set the request options object up.
    let requestOptions = {
      headers: {},
      params: params,
    };

    // Check Oauth token
    if (this._authMode === "oauth") {
      await this.checkOAuthToken();
      if (this._oAuthToken !== undefined)
        requestOptions.headers.Authorization = "Bearer " + this._oAuthToken;
    }

    // // Add params to call
    // if (params !== undefined)
    //   requestOptions.params = { ...requestOptions.params, ...params };

    // Must bind this to a variable so that it can be accessed in the promise... UGLY! Please find a better way.
    let that = this;

    return new Promise(function (resolve, reject) {
      that.client
        .get(path, requestOptions)
        .then(function (response) {
          that.successLogger(response, "getSinglePage");
          resolve({
            data: response.data,
          });
        })
        .catch(function (error) {
          that.errorLogger(error, "getSinglePage");
          reject(error);
        });
    });
  }

  // Log the details of a success response
  successLogger(response, method) {
    if (debug) {
      log.info("SUCCESS: " + method + " returned a success response");
      log.debug(response.status);
      log.debug(response.data);
      log.debug(response.statusText);
      log.debug(response.headers);
      log.debug(response.config);
    }
  }

  // Log the details of any failed API call.
  errorLogger(error, method) {
    log.error("Error occured duing " + method);
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      log.error(method + " returned a non 200 status response");
      log.error(error.response.data);
      log.error(error.response.status);
      log.error(error.response.headers);
    } else if (error.request) {
      // The request was made but no response was received
      // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
      // http.ClientRequest in node.js
      log.error(method + " failed: server did not respond");
      log.error(error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      log.error(method + " failed: request not sent");
      log.error("Error", error.message);
    }
    if (debug) log.debug(error.config);
  }

  // Validates the type of the params object and returns a valid URLSearchParams or throws a type error
  _validateParams(params) {
    let validatedParams;
    if (params === undefined) validatedParams = new URLSearchParams();
    else if (!(params instanceof URLSearchParams))
      // TODO attempt to copy params from a standard object into this URLSearchParams, throw error on fail.
      throw new TypeError("Expected params to be of type URLSearchParams.");
    else validatedParams = params;

    return validatedParams;
  }

  // Fetch all pages of data from an api resource
  async getAll(path, params) {
    if (debug) {
      log.info("Fetching all pages for path: " + path);
      log.info("Params supplied for " + path + ": ", params);
    }

    let serachParams = this._validateParams(params);

    // bind this to that :(
    let that = this;
    let pageOneResults = undefined;

    return new Promise(async function (resolve, reject) {
      // 1: First fetch one page to determine the total number of results for this resource.
      await that
        .getSinglePage(path, params)
        .then(function (response) {
          pageOneResults = { isValid: true, ...response };
        })
        .catch(function (error) {
          pageOneResults = {
            isValid: false,
            message: "Failed to fetch first page",
            error: error,
          };
        });
      // 2: Calculate how many pages need to be fetched to fetch all data in this resource.
      // Ensure step 1 was a success.
      if (pageOneResults.isValid === false) {
        reject({
          error: pageOneResults.error,
          message: pageOneResults.message,
        });
      } else {
        let totalResults = pageOneResults.data.meta.pageInfo.totalResults;
        let pagesRequired = Math.ceil(totalResults / that._maxResults);
        let requests = [];
        for (let i = 1; i < pagesRequired; i++) {
          let currentParams = new URLSearchParams(serachParams);
          currentParams.set("startAt", that._maxResults * i);
          let request = that.getSinglePage(path, currentParams);
          requests.push(request);
        }
        // 3: Dispatch requests for each page required
        let promises = Promise.all(requests);

        // 4: Merge resutls
        let toReturn = {
          data: [],
          linked: {},
        };
        toReturn.data = toReturn.data.concat(pageOneResults.data.data);
        toReturn.linked = object.merge(
          toReturn.linked,
          pageOneResults.data.linked
        );
        await promises
          .then((pages) => {
            pages.forEach((page) => {
              toReturn.data = toReturn.data.concat(page.data.data);
              toReturn.linked = object.merge(toReturn.linked, page.data.linked);
            });
          })
          .catch((error) => {
            toReturn = error;
            reject(toReturn);
          });

        // 5: Return fetched data.
        resolve(toReturn);
      }
    });
  }

  // Get a file stream to download attachment files.
  async getFileStream(attachmentId) {
    let requestOptions = {
      headers: {},
      responseType: "stream",
    };

    // Check Oauth token
    if (this._authMode === "oauth") {
      await this.checkOAuthToken();
      if (this._oAuthToken !== undefined)
        requestOptions.headers.Authorization = "Bearer " + this._oAuthToken;
    }
    // Must bind this to a variable so that it can be accessed in the promise... UGLY! Please find a better way.
    let that = this;

    return new Promise((resolve, reject) => {
      that.client
        .get(`attachments/${attachmentId}/file`, requestOptions)
        .then(function (response) {
          that.successLogger(response, "getFileStream");
          resolve({
            data: response.data,
          });
        })
        .catch(function (error) {
          that.errorLogger(error, "getSinglePage");
          reject(error);
        });
    });
  }
}

exports.JamaClient = JamaClient;
// exports.JamaClient.getSinglePage = JamaClient.getSinglePage;
// exports.JamaClient.getAll = JamaClient.getAll;
// exports.JamaClient.getFileStream = JamaClient.getFileStream;
