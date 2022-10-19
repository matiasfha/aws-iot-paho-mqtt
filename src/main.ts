import AWS from "aws-sdk";
import PahoMqtt, { Message } from "paho-mqtt";

import { getAWSCredentials, getAWSIotEndpoint } from "./helpers";
import { BaseArgs, ClientArgs } from "./types";

export default class MqttClient extends EventTarget {
  private static instance: MqttClient;

  private currentTopic: string[] = [];

  private mqttClient: PahoMqtt.Client;

  private region;

  private mqttId;

  private identityPoolId;

  public isConnected = false;

  private clientId = Math.random().toString(36).substring(7);

  private constructor(args: BaseArgs) {
    super();
    let endpoint = "wss://no-credentials-available/";

    this.mqttClient = new PahoMqtt.Client(endpoint, this.clientId);
    this.region = args.region;
    this.mqttId = args.mqttId;
    this.identityPoolId = args.identityPoolId;
  }

  private updateClient(args: ClientArgs) {
    const endpoint = getAWSIotEndpoint(args);
    let client = new PahoMqtt.Client(endpoint, args.clientId);
    return client;
  }

  public static getInstance(args: BaseArgs): MqttClient {
    if (!MqttClient.instance) {
      MqttClient.instance = new MqttClient(args);
    }

    return MqttClient.instance;
  }

  public listenConnectionStatus(callback: () => void) {
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
  public async connect() {
    try {
      const { accessKeyId, secretAccessKey, sessionToken } =
        await getAWSCredentials({
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
    } catch (error) {
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
        this.dispatchEvent(
          new CustomEvent("client-connected", {
            detail: { isConnected: this.isConnected },
          })
        );
      },
      onFailure: (err) => {
        console.error("mqttClient error:", err);
        this.isConnected = false;
        this.dispatchEvent(
          new CustomEvent("client-disconnected", {
            detail: { isConnected: this.isConnected },
          })
        );
      },
    });

    this.mqttClient.onMessageArrived = (message: Message) => {
      const data = message.payloadString;
      const topic = message.destinationName;
      this.dispatchEvent(
        new CustomEvent("data", {
          detail: { topic, data },
        })
      );
    };

    this.mqttClient.onMessageDelivered = (message: Message) => {
      const data = message.payloadString;
      const topic = message.destinationName;
      this.dispatchEvent(
        new CustomEvent("dataSent", {
          detail: { topic, data },
        })
      );
    };
  }

  /**
   * Connect to a topic. This will enable the app to receive silent messages
   * @param topic
   */
  public subscribeToTopic(topic: string): boolean {
    if (!this.mqttClient) throw new Error("MQTT Client not connected!");

    if (this.currentTopic.includes(topic)) return false;

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
  public unsubscribeFromTopic(topic: string) {
    if (!this.mqttClient) throw new Error("MQTT Client not connected!");

    if (topic) {
      if (this.mqttClient.isConnected()) {
        this.mqttClient.unsubscribe(topic);
      }
      this.currentTopic = this.currentTopic.filter((it) => it !== topic);
    }
  }
}
