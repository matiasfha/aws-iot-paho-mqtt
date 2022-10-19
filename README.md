# AWS IOT PAHO MQTT

This package is a lightweight library to connect to the AWS IoT Service using an ESM friendly code based on [paho-mqtt](https://www.npmjs.com/package/paho-mqtt) and [crypto-js](https://www.npmjs.com/package/crypto-js)

If you have any issues or feature requests, please file an issue or pull request.

This small library was built as an ad-hoc replacement for a particular use case where the use of the packages provided by aws was not useful since they do not support ESM and have many node-related dependencies.


## Installation

Use your favorite package manader

```
npm install aws-iot-paho-mqtt

yarn add aws-iot-paho-mqtt

pnpm add aws-iot-paho-mqtt


## Usage

Import the package and connect to the IoT service

```js
import { IoTMqttClient} from 'aws-iot-paho-mqtt';

IoTMqttClient.getInstance().connect();
```


Then somewhere else in your code you can subscribe or unsubscribe to a topic

```js
const subscribed = IoTMqttClient.getInstance().subscribeToTopic(topicUrl);

IoTMqttClient.getInstance().unsubscribeFromTopic(topicUrl);

```

Or listen to some of the events
- `client-connected`
- `client-disconnected`
- `data` (for when a message arrive)
- `dataSent` (for when a message is sent)