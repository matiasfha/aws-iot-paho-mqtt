'use strict';

var PahoMqtt = require('paho-mqtt');
var AWS = require('aws-sdk');
var HmacSHA256 = require('crypto-js/hmac-sha256');
var SHA256 = require('crypto-js/sha256');
var encHex = require('crypto-js/enc-hex');

async function getAWSCredentials({ region, identityPoolId, }) {
    AWS.config.region = region;
    AWS.config.credentials = new AWS.CognitoIdentityCredentials({
        IdentityPoolId: identityPoolId,
    });
    return new Promise((resolve, reject) => {
        AWS.config.getCredentials((err) => {
            if (err) {
                return reject(err);
            }
            return resolve(AWS.config.credentials);
        });
    });
}
const Crypto = {
    sign: function (key, msg) {
        const hash = HmacSHA256(msg, key);
        return hash.toString(encHex);
    },
    sha256: function (msg) {
        const hash = SHA256(msg);
        return hash.toString(encHex);
    },
    getSignatureKey: function (key, dateStamp, regionName, serviceName) {
        const kDate = HmacSHA256(dateStamp, "AWS4" + key);
        const kRegion = HmacSHA256(regionName, kDate);
        const kService = HmacSHA256(serviceName, kRegion);
        const kSigning = HmacSHA256("aws4_request", kService);
        return kSigning;
    },
};
function getAWSIotEndpoint({ accessKeyId, secretAccessKey, sessionToken, region, mqttId, }) {
    // example: blahblahblah-ats.iot.your-region.amazonaws.com
    const IOT_ENDPOINT = `${mqttId}.iot.${region}.amazonaws.com`;
    // your AWS access key ID
    const KEY_ID = accessKeyId;
    // your AWS secret access key
    const SECRET_KEY = secretAccessKey;
    // date & time
    const dt = new Date().toISOString().replace(/[^0-9]/g, "");
    const ymd = dt.slice(0, 8);
    const fdt = `${ymd}T${dt.slice(8, 14)}Z`;
    const scope = `${ymd}/${region}/iotdevicegateway/aws4_request`;
    const ks = encodeURIComponent(`${KEY_ID}/${scope}`);
    const algorithm = "X-Amz-Algorithm=AWS4-HMAC-SHA256";
    const credentials = `X-Amz-Credential=${ks}`;
    const date = `X-Amz-Date=${fdt}`;
    const baseQueryString = `${algorithm}&${credentials}&${date}&X-Amz-SignedHeaders=host`;
    const request = `GET\n/mqtt\n${baseQueryString}\nhost:${IOT_ENDPOINT}\n\nhost\n${Crypto.sha256("")}`;
    const signature = Crypto.sign(Crypto.getSignatureKey(SECRET_KEY, ymd, region, "iotdevicegateway"), `AWS4-HMAC-SHA256\n${fdt}\n${scope}\n${Crypto.sha256(request)}`);
    const securityToken = encodeURIComponent(sessionToken);
    const signatureQueryString = `&X-Amz-Signature=${signature}`;
    const securityQueryString = `&X-Amz-Security-Token=${securityToken}`;
    return `wss://${IOT_ENDPOINT}/mqtt?${baseQueryString}${signatureQueryString}${securityQueryString}`;
}

class MqttClient extends EventTarget {
    static instance;
    currentTopic = [];
    mqttClient;
    region;
    mqttId;
    identityPoolId;
    isConnected = false;
    clientId = Math.random().toString(36).substring(7);
    constructor(args) {
        super();
        let endpoint = "wss://no-credentials-available/";
        this.mqttClient = new PahoMqtt.Client(endpoint, this.clientId);
        this.region = args.region;
        this.mqttId = args.mqttId;
        this.identityPoolId = args.identityPoolId;
    }
    updateClient(args) {
        const endpoint = getAWSIotEndpoint(args);
        let client = new PahoMqtt.Client(endpoint, args.clientId);
        return client;
    }
    static getInstance(args) {
        if (!MqttClient.instance) {
            MqttClient.instance = new MqttClient(args);
        }
        return MqttClient.instance;
    }
    listenConnectionStatus(callback) {
        if (this.isConnected) {
            callback();
            return;
        }
        this.addEventListener("client-connected", callback);
        return () => this.removeEventListener("client-connected", callback);
    }
    /**
     * Connect the MQTT client to AWS Iot with credentials given in the env file
     */
    async connect() {
        try {
            const { accessKeyId, secretAccessKey, sessionToken } = await getAWSCredentials({
                region: this.region,
                identityPoolId: this.identityPoolId,
            });
            // Update the client with the updated credentials
            this.mqttClient = this.updateClient({
                accessKeyId,
                secretAccessKey,
                sessionToken,
                region: this.region,
                mqttId: this.mqttId,
                clientId: this.clientId,
            });
        }
        catch (error) {
            console.error("MQTT client not connected", error);
            throw error;
        }
        this.mqttClient.connect({
            reconnect: true,
            mqttVersion: 4,
            timeout: 3,
            useSSL: true,
            onSuccess: () => {
                console.info("MqttClient connected!");
                this.isConnected = true;
                this.dispatchEvent(new CustomEvent("client-connected", {
                    detail: { isConnected: this.isConnected },
                }));
            },
            onFailure: (err) => {
                console.error("mqttClient error:", err);
                this.isConnected = false;
                this.dispatchEvent(new CustomEvent("client-disconnected", {
                    detail: { isConnected: this.isConnected },
                }));
            },
        });
        this.mqttClient.onMessageArrived = (message) => {
            const data = message.payloadString;
            const topic = message.destinationName;
            this.dispatchEvent(new CustomEvent("data", {
                detail: { topic, data },
            }));
        };
        this.mqttClient.onMessageDelivered = (message) => {
            const data = message.payloadString;
            const topic = message.destinationName;
            this.dispatchEvent(new CustomEvent("dataSent", {
                detail: { topic, data },
            }));
        };
    }
    /**
     * Connect to a topic. This will enable the app to receive silent messages
     * @param topic
     */
    subscribeToTopic(topic) {
        if (!this.mqttClient)
            throw new Error("MQTT Client not connected!");
        if (this.currentTopic.includes(topic))
            return false;
        this.currentTopic.push(topic);
        if (this.mqttClient.isConnected()) {
            this.mqttClient.subscribe(topic);
        }
        return true;
    }
    /**
     * Stop from receiving silent messages from the topic
     * @param topic
     */
    unsubscribeFromTopic(topic) {
        if (!this.mqttClient)
            throw new Error("MQTT Client not connected!");
        if (topic) {
            if (this.mqttClient.isConnected()) {
                this.mqttClient.unsubscribe(topic);
            }
            this.currentTopic = this.currentTopic.filter((it) => it !== topic);
        }
    }
}

module.exports = MqttClient;
