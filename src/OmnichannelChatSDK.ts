/* eslint-disable @typescript-eslint/no-non-null-assertion */

import {SDKProvider as OCSDKProvider, uuidv4 } from "@microsoft/ocsdk";
import {SDKProvider as IC3SDKProvider} from '@microsoft/omnichannel-ic3core';
import ChatAdapterProtocols from "./core/ChatAdapterProtocols";
import DeliveryMode from "@microsoft/omnichannel-ic3core/lib/model/DeliveryMode";
import FileSharingProtocolType from "@microsoft/omnichannel-ic3core/lib/model/FileSharingProtocolType";
import HostType from "@microsoft/omnichannel-ic3core/lib/interfaces/HostType";
import IAuthSettings from "./core/IAuthSettings";
import IChatConfig from "./core/IChatConfig";
import IChatSDKConfig from "./core/IChatSDKConfig";
import IChatSDKMessage from "./core/IChatSDKMessage";
import IChatToken from "./external/IC3Adapter/IChatToken";
import IChatTranscriptBody from "./core/IChatTranscriptBody";
import IConversation from "@microsoft/omnichannel-ic3core/lib/model/IConversation";
import IFileInfo from "@microsoft/omnichannel-ic3core/lib/interfaces/IFileInfo";
import IFileMetadata from "@microsoft/omnichannel-ic3core/lib/model/IFileMetadata";
import IGetChatTokenOptionalParams from "@microsoft/ocsdk/lib/Interfaces/IGetChatTokenOptionalParams";
import IGetChatTranscriptsOptionalParams from "@microsoft/ocsdk/lib/Interfaces/IGetChatTranscriptsOptionalParams";
import IIC3AdapterOptions from "./external/IC3Adapter/IIC3AdapterOptions";
import ILiveChatContext from "./core/ILiveChatContext";
import IMessage from "@microsoft/omnichannel-ic3core/lib/model/IMessage";
import InitContext from "@microsoft/ocsdk/lib/Model/InitContext";
import IOmnichannelConfig from "./core/IOmnichannelConfig";
import IOmnichannelConfiguration from "@microsoft/ocsdk/lib/Interfaces/IOmnichannelConfiguration";
import IPerson from "@microsoft/omnichannel-ic3core/lib/model/IPerson";
import IRawMessage from "@microsoft/omnichannel-ic3core/lib/model/IRawMessage";
import IRawThread from "@microsoft/omnichannel-ic3core/lib/interfaces/IRawThread";
import ISessionInitOptionalParams from "@microsoft/ocsdk/lib/Interfaces/ISessionInitOptionalParams";
import ISessionCloseOptionalParams from "@microsoft/ocsdk/lib/Interfaces/ISessionCloseOptionalParams";
import IEmailTranscriptOptionalParams from "@microsoft/ocsdk/lib/Interfaces/IEmailTranscriptOptionalParams";
import IStartChatOptionalParams from "./core/IStartChatOptionalParams";
import MessageContentType from "@microsoft/omnichannel-ic3core/lib/model/MessageContentType";
import MessageType from "@microsoft/omnichannel-ic3core/lib/model/MessageType";
import PersonType from "@microsoft/omnichannel-ic3core/lib/model/PersonType";
import platform from "./utils/platform";
import ProtocolType from "@microsoft/omnichannel-ic3core/lib/interfaces/ProtocoleType";
import libraries from "./utils/libraries";
import {isCustomerMessage} from "./utils/utilities";
import validateOmnichannelConfig from "./validators/OmnichannelConfigValidator";
import validateSDKConfig, {defaultChatSDKConfig} from "./validators/SDKConfigValidators";
import ISDKConfiguration from "@microsoft/ocsdk/lib/Interfaces/ISDKConfiguration";
import { loadScript } from "./utils/WebUtils";
import createVoiceVideoCalling from "./api/createVoiceVideoCalling";
import CallingOptionsOptionSetNumber from "./core/CallingOptionsOptionSetNumber";

class OmnichannelChatSDK {
    private debug: boolean;
    public OCSDKProvider: unknown;
    public IC3SDKProvider: unknown;
    public OCClient: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    public IC3Client: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    public omnichannelConfig: IOmnichannelConfig;
    public chatSDKConfig: IChatSDKConfig;
    public requestId: string;
    private chatToken: IChatToken;
    private liveChatConfig: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    private dataMaskingRules: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    private authSettings: IAuthSettings | null = null;
    private authenticatedUserToken: string | null = null;
    private preChatSurvey: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    private conversation: IConversation | null = null;
    private callingOption: CallingOptionsOptionSetNumber = CallingOptionsOptionSetNumber.NoCalling;

    constructor(omnichannelConfig: IOmnichannelConfig, chatSDKConfig: IChatSDKConfig = defaultChatSDKConfig) {
        this.debug = false;
        this.omnichannelConfig = omnichannelConfig;
        this.chatSDKConfig = chatSDKConfig;
        this.requestId = uuidv4();
        this.chatToken = {};
        this.liveChatConfig = {};
        this.dataMaskingRules = {};
        this.authSettings = null;
        this.preChatSurvey = null;

        validateOmnichannelConfig(omnichannelConfig);
        validateSDKConfig(chatSDKConfig);
    }

    /* istanbul ignore next */
    public setDebug(flag: boolean): void {
        this.debug = flag;
    }

    public async initialize(): Promise<IChatConfig> {
        this.OCSDKProvider = OCSDKProvider;
        this.OCClient = await OCSDKProvider.getSDK(this.omnichannelConfig as IOmnichannelConfiguration, {} as ISDKConfiguration, undefined as any); // eslint-disable-line @typescript-eslint/no-explicit-any
        this.IC3Client = await this.getIC3Client();
        return this.getChatConfig();
    }

    public async startChat(optionalParams: IStartChatOptionalParams = {}): Promise<void> {

        if (optionalParams.liveChatContext) {
            this.chatToken = optionalParams.liveChatContext.chatToken || {};
            this.requestId = optionalParams.liveChatContext.requestId || uuidv4();
        }

        if (this.chatToken && Object.keys(this.chatToken).length === 0) {
            await this.getChatToken(false);
        }

        const sessionInitOptionalParams: ISessionInitOptionalParams = {
            initContext: {} as InitContext
        };

        if (optionalParams.preChatResponse) {
            sessionInitOptionalParams.initContext!.preChatResponse = optionalParams.preChatResponse;
        }

        if (this.authenticatedUserToken) {
            sessionInitOptionalParams.authenticatedUserToken = this.authenticatedUserToken;
        }

        try {
            await this.OCClient.sessionInit(this.requestId, sessionInitOptionalParams);
        } catch (error) {
            console.error(`OmnichannelChatSDK/startChat/sessionInit/error ${error}`);
            return error;
        }

        try {
            await this.IC3Client.initialize({
                token: this.chatToken.token,
                regionGtms: this.chatToken.regionGTMS,
                visitor: true
            });
        } catch (error) {
            console.error(`OmnichannelChatSDK/startChat/initialize/error ${error}`);
            return error;
        }

        try {
            this.conversation = await this.IC3Client.joinConversation(this.chatToken.chatId);
        } catch (error) {
            console.error(`OmnichannelChatSDK/startChat/joinConversation/error ${error}`);
            return error;
        }
    }

    public async endChat(): Promise<void> {
        const sessionCloseOptionalParams: ISessionCloseOptionalParams = {};
        if (this.authenticatedUserToken) {
            sessionCloseOptionalParams.authenticatedUserToken = this.authenticatedUserToken;
        }

        try {
            await this.OCClient.sessionClose(this.requestId, sessionCloseOptionalParams);
            this.conversation!.disconnect();
            this.conversation = null;
            this.requestId = uuidv4();
            this.chatToken = {};
        } catch (error) {
            console.error(`OmnichannelChatSDK/endChat/error ${error}`);
            return error;
        }
    }

    public async getCurrentLiveChatContext(): Promise<ILiveChatContext | {}> {
        const chatToken = await this.getChatToken();
        const {requestId} = this;

        const chatSession: ILiveChatContext = {
            chatToken,
            requestId
        }

        if (Object.keys(chatSession.chatToken).length === 0) {
            return {};
        }

        return chatSession;
    }

    /**
     * Gets PreChat Survey.
     * @param parse Whether to parse PreChatSurvey to JSON or not.
     */
    public async getPreChatSurvey(parse = true): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
        return parse ? JSON.parse(this.preChatSurvey) : this.preChatSurvey;
    }

    public async getLiveChatConfig(cached = true): Promise<IChatConfig> {
        if (cached) {
            return this.liveChatConfig;
        }

        return this.getChatConfig();
    }

    public async getChatToken(cached = true): Promise<IChatToken> {
        if (!cached) {
            try {
                const getChatTokenOptionalParams: IGetChatTokenOptionalParams = {};
                if (this.authenticatedUserToken) {
                    getChatTokenOptionalParams.authenticatedUserToken = this.authenticatedUserToken;
                }
                const chatToken = await this.OCClient.getChatToken(this.requestId, getChatTokenOptionalParams);
                const {ChatId: chatId, Token: token, RegionGtms: regionGtms, ExpiresIn: expiresIn, VisitorId: visitorId, VoiceVideoCallToken: voiceVideoCallToken} = chatToken;
                this.chatToken = {
                    chatId,
                    regionGTMS: JSON.parse(regionGtms),
                    requestId: this.requestId,
                    token,
                    expiresIn,
                    visitorId,
                    voiceVideoCallToken
                };
            } catch (error) {
                console.error(`OmnichannelChatSDK/getChatToken/error ${error}`);
            }
        }

        return this.chatToken;
    }

    public async getMessages(): Promise<IMessage[] | undefined> {
        return this.conversation?.getMessages();
    }

    public async getDataMaskingRules(): Promise<any> {  // eslint-disable-line  @typescript-eslint/no-explicit-any
        return this.dataMaskingRules;
    }

    public async sendMessage(message: IChatSDKMessage): Promise<void> {
        const {disable, maskingCharacter} = this.chatSDKConfig.dataMasking;

        let {content} = message;
        if (Object.keys(this.dataMaskingRules).length > 0 && !disable) {
            for (const maskingRule of Object.values(this.dataMaskingRules)) {
                const regex = new RegExp(maskingRule as string, 'g');
                let match;
                while (match = regex.exec(content)) {  // eslint-disable-line no-cond-assign
                    const replaceStr = match[0].replace(/./g, maskingCharacter);
                    content = content.replace(match[0], replaceStr);
                }
            }
        }
        message.content = content;

        const messageToSend: IRawMessage = {
            content: message.content,
            timestamp: new Date(),
            contentType: MessageContentType.Text,
            deliveryMode: DeliveryMode.Bridged,
            messageType: MessageType.UserMessage,
            properties: undefined,
            tags: [], // OC tag (system)
            sender: {
              displayName : "Customer",
              id : "customer",
              type : PersonType.User
            }
        };

        if (message.tags) {
            messageToSend.tags = message.tags;
        }

        if (message.timestamp) {
            messageToSend.timestamp = message.timestamp;
        }

        return this.conversation!.sendMessage(messageToSend);
    }

    public onNewMessage(onNewMessageCallback: CallableFunction): void {
        this.conversation?.registerOnNewMessage((message: IRawMessage) => {
            const {messageType} = message;

            // Filter out customer messages
            if (isCustomerMessage(message)) {
                return;
            }

            if (messageType !== MessageType.Typing) {
                onNewMessageCallback(message);
            }
        });
    }

    public async sendTypingEvent(): Promise<void> {
        const typingPayload = `{isTyping: 0}`;
        try {
            await this.conversation!.indicateTypingStatus(0);
            const members: IPerson[] = await this.conversation!.getMembers();
            const botMembers = members.filter((member: IPerson) => member.type === PersonType.Bot);
            await this.conversation!.sendMessageToBot(botMembers[0].id, {payload: typingPayload});
        } catch (error) {
            console.error("OmnichannelChatSDK/sendTypingEvent/error");
            return error;
        }
    }

    public async onTypingEvent(onTypingEventCallback: CallableFunction): Promise<void> {
        this.conversation?.registerOnNewMessage((message: IRawMessage) => {
            const {messageType} = message;

            // Filter out customer messages
            if (isCustomerMessage(message)) {
                return;
            }

            if (messageType === MessageType.Typing) {
                onTypingEventCallback(message);
            }
        });
    }

    public async onAgentEndSession(onAgentEndSessionCallback: (message: IRawThread) => void): Promise<void> {
        this.conversation?.registerOnThreadUpdate((message: IRawThread) => {
            const {members} = message;

            // Agent ending conversation would have 1 member left in the chat thread
            if (members.length === 1) {
                onAgentEndSessionCallback(message);
            }
        });
    }

    public async uploadFileAttachment(fileInfo: IFileInfo): Promise<IRawMessage> {
        const fileMetadata: IFileMetadata = await this.conversation!.sendFileData(fileInfo, FileSharingProtocolType.AmsBasedFileSharing);

        const messageToSend: IRawMessage = {
            content: "",
            timestamp: new Date(),
            contentType: MessageContentType.Text,
            deliveryMode: DeliveryMode.Bridged,
            messageType: MessageType.UserMessage,
            tags: [],
            sender: {
                displayName: "Customer",
                id: "customer",
                type: PersonType.User,
            },
            fileMetadata: fileMetadata
        };

        try {
            await this.conversation!.sendFileMessage(fileMetadata, messageToSend);
            return messageToSend;
        } catch (error) {
            console.error(`OmnichannelChatSDK/uploadFileAttachment/error: ${error}`);
            return error;
        }
    }

    public async downloadFileAttachment(fileMetadata: IFileMetadata): Promise<Blob> {
        return this.conversation!.downloadFile(fileMetadata);
    }

    public async emailLiveChatTranscript(body: IChatTranscriptBody): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
        const emailTranscriptOptionalParams: IEmailTranscriptOptionalParams = {};
        if (this.authenticatedUserToken) {
            emailTranscriptOptionalParams.authenticatedUserToken = this.authenticatedUserToken;
        }
        const emailRequestBody = {
            ChatId: this.chatToken.chatId,
            EmailAddress: body.emailAddress,
            DefaultAttachmentMessage: body.attachmentMessage,
            CustomerLocale: body.locale
        };
        return this.OCClient.emailTranscript(
            this.requestId,
            this.chatToken.token,
            emailRequestBody,
            emailTranscriptOptionalParams);
    }

    public async getLiveChatTranscript(): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
        const getChatTranscriptOptionalParams: IGetChatTranscriptsOptionalParams = {};
        if (this.authenticatedUserToken) {
            getChatTranscriptOptionalParams.authenticatedUserToken = this.authenticatedUserToken;
        }
        return this.OCClient.getChatTranscripts(
            this.requestId,
            this.chatToken.chatId,
            this.chatToken.token,
            getChatTranscriptOptionalParams);
    }

    public async createChatAdapter(protocol: string = ChatAdapterProtocols.IC3): Promise<unknown> {
        if (platform.isNode() || platform.isReactNative()) {
            return Promise.reject('ChatAdapter is only supported on browser');
        }

        if (protocol !== ChatAdapterProtocols.IC3) {
            return Promise.reject(`ChatAdapter for protocol ${protocol} currently not supported`);
        }

        return new Promise (async (resolve, reject) => { // eslint-disable-line no-async-promise-executor
            const ic3AdapterCDNUrl = libraries.getIC3AdapterCDNUrl();
            await loadScript(ic3AdapterCDNUrl, () => {
                /* istanbul ignore next */
                this.debug && console.debug('IC3Adapter loaded!');
                const adapterConfig: IIC3AdapterOptions = {
                    chatToken: this.chatToken,
                    userDisplayName: 'Customer',
                    userId: 'teamsvisitor',
                    sdkURL: libraries.getIC3ClientCDNUrl()
                };

                const adapter = new window.Microsoft.BotFramework.WebChat.IC3Adapter(adapterConfig);
                resolve(adapter);
            }, () => {
                reject('Failed to load IC3Adapter');
            });
        });
    }

    public async getVoiceVideoCalling(params: any = {}): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (platform.isNode() || platform.isReactNative()) {
            return Promise.reject('VoiceVideoCalling is only supported on browser');
        }

        if (this.callingOption.toString() === CallingOptionsOptionSetNumber.NoCalling.toString()) {
            return Promise.reject('Voice and video call is not enabled');
        }

        const chatConfig = await this.getChatConfig();
        const {LiveWSAndLiveChatEngJoin: liveWSAndLiveChatEngJoin} = chatConfig;
        const {msdyn_widgetsnippet} = liveWSAndLiveChatEngJoin;

        // Find src attribute with its url in code snippet
        const widgetSnippetSourceRegex = new RegExp(`src="(https:\\/\\/[\\w-.]+)[\\w-.\\/]+"`);
        const result = msdyn_widgetsnippet.match(widgetSnippetSourceRegex);
        if (result && result.length) {
            return new Promise (async (resolve, reject) => { // eslint-disable-line no-async-promise-executor
                const spoolSDKCDNUrl = `${result[1]}/livechatwidget/WebChatControl/lib/spool-sdk/sdk.bundle.js`;
                await loadScript(spoolSDKCDNUrl, () => {
                    /* istanbul ignore next */
                    this.debug && console.debug(`${spoolSDKCDNUrl} loaded!`);
                }, () => {
                    reject('Failed to load SpoolSDK');
                });

                const LiveChatWidgetLibCDNUrl = `${result[1]}/livechatwidget/WebChatControl/lib/LiveChatWidgetLibs.min.js`;
                await loadScript(LiveChatWidgetLibCDNUrl, async () => {
                    this.debug && console.debug(`${LiveChatWidgetLibCDNUrl} loaded!`);
                    const VoiceVideoCalling = await createVoiceVideoCalling(params);
                    resolve(VoiceVideoCalling);
                }, async () => {
                    reject('Failed to load VoiceVideoCalling');
                });
            });
        }
    }

    private async getIC3Client() {
        if (platform.isNode() || platform.isReactNative()) {
            this.debug && console.debug('IC3Core');
            // Use FramelessBridge from IC3Core
            this.IC3SDKProvider = IC3SDKProvider;
            const IC3Client = await IC3SDKProvider.getSDK({
                hostType: HostType.Page,
                protocolType: ProtocolType.IC3V1SDK
            });
            IC3Client.setDebug(this.debug);
            return IC3Client;
        } else {
            this.debug && console.debug('IC3Client');
            // Use IC3Client if browser is detected
            return new Promise (async (resolve, reject) => { // eslint-disable-line no-async-promise-executor
                const ic3ClientCDNUrl = libraries.getIC3ClientCDNUrl();

                window.addEventListener("ic3:sdk:load", async () => {
                    // Use FramedBridge from IC3Client
                    /* istanbul ignore next */
                    this.debug && console.debug('ic3:sdk:load');
                    const {SDK: ic3sdk} = window.Microsoft.CRM.Omnichannel.IC3Client;
                    const {SDKProvider: IC3SDKProvider} = ic3sdk;
                    this.IC3SDKProvider = IC3SDKProvider;
                    const IC3Client = await IC3SDKProvider.getSDK({
                        hostType: HostType.IFrame,
                        protocolType: ProtocolType.IC3V1SDK
                    });
                    resolve(IC3Client);
                });

                await loadScript(ic3ClientCDNUrl, () => {
                    this.debug && console.debug('IC3Client loaded!');
                }, () => {
                    reject('Failed to load IC3Adapter');
                });
            });
        }
    }

    private async getChatConfig(): Promise<IChatConfig> {
        try {
            const liveChatConfig = await this.OCClient.getChatConfig();
            const {
                DataMaskingInfo: dataMaskingConfig,
                LiveChatConfigAuthSettings: authSettings,
                LiveWSAndLiveChatEngJoin: liveWSAndLiveChatEngJoin
            } = liveChatConfig;

            const {setting} = dataMaskingConfig;
            if (setting.msdyn_maskforcustomer) {
                this.dataMaskingRules = dataMaskingConfig.dataMaskingRules;
            }

            if (authSettings) {
                this.authSettings = authSettings;
            }

            const {PreChatSurvey: preChatSurvey, msdyn_prechatenabled, msdyn_callingoptions} = liveWSAndLiveChatEngJoin;
            const isPreChatEnabled = msdyn_prechatenabled === true || msdyn_prechatenabled == "true";
            if (isPreChatEnabled && preChatSurvey && preChatSurvey.trim().length > 0) {
                this.preChatSurvey = preChatSurvey;
            }

            if (this.authSettings){
                if (this.chatSDKConfig.getAuthToken){
                    this.debug && console.log("OmnichannelChatSDK/getChatConfig/auth settings with auth and getAuthToken!", this.authSettings, this.chatSDKConfig.getAuthToken);
                    const token = await this.chatSDKConfig.getAuthToken();
                    if (token) {
                        this.authenticatedUserToken = token;
                    }
                    else {
                        console.warn("OmnichannelChatSDK/getChatConfig/auth, chat requires auth, but getAuthToken() returned null");
                    }
                }
                else {
                    console.warn("OmnichannelChatSDK/getChatConfig/auth, chat requires auth, but getAuthToken() is missing");
                }
            }

            if (this.preChatSurvey) {
                this.debug && console.log('Prechat Survey!');
            }

            this.callingOption = msdyn_callingoptions;
            this.liveChatConfig = liveChatConfig;
            return this.liveChatConfig;
        } catch (error) {
            console.error(`OmnichannelChatSDK/getChatConfig/error ${error}`);
            return error;
        }
    }
}

export default OmnichannelChatSDK;