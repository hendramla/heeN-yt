import axios from "axios";
import apiList from "./apiRoutes.js";
import gridParser from "./methods/gridParser.js";
import playListParser from "./methods/playListParser.js";
import channelParser from "./methods/channelParser.js";
import playListVideoItemRender from "./methods/playListVideoItemRender.js";
import richSessionParse from "./methods/richSessionParse.js";
import parsePostRenderer from "./methods/parsePostRenderer.js";
import feedParser from "./methods/feedParser.js";
import shortVideoParser from "./methods/shortVideoParser.js";
import ApiError from "./apiError.js";

const youtubeEndpoint = `https://www.youtube.com`;

const config = {
    baseURL: youtubeEndpoint,
    timeout: 60 * 1000,
    withCredentials: true,
};

const YoutubeSearchApi = axios.create(config);

export const GetYoutubeInitData = async (url) => {

    let initData = {};
    let playerData = null;
    let apiToken = null;
    let context = null;

    try {
        const page = await YoutubeSearchApi.get(encodeURI(url));
        const ytInitData = await page.data.split("var ytInitialData =");
        const ytPlayerData = await page.data.split("var ytInitialPlayerResponse =");
        if (ytInitData && ytInitData.length > 1) {
            const data = await ytInitData[1].split("</script>")[0].slice(0, -1);
            const playerResponse = ytPlayerData && ytPlayerData.length > 1 ? ytPlayerData[1].split("</script>")[0].slice(0, -1) : null;
            if (page.data.split("innertubeApiKey").length > 0) {
                apiToken = await page.data
                    .split("innertubeApiKey")[1]
                    .trim()
                    .split(",")[0]
                    .split('"')[2];
            }

            if (page.data.split("INNERTUBE_CONTEXT").length > 0) {
                context = await JSON.parse(
                    page.data.split("INNERTUBE_CONTEXT")[1].trim().slice(2, -2)
                );
            }

            initData = await JSON.parse(data);

            if (ytPlayerData && ytPlayerData.length > 1) {
                playerData = await JSON.parse(playerResponse);
            }

            return await Promise.resolve({ initData, playerData, apiToken, context });
        } else {
            console.error("cannot_get_init_data");
            return await Promise.reject("cannot_get_init_data");
        }
    } catch (ex) {
        console.error(ex);
        return await Promise.reject(ex);
    }
};

export const GetListByKeyword = async (
    keyword,
    withPlaylist = false,
    limit = 0,
    options = []
) => {

    let endpoint = `${youtubeEndpoint}/results?search_query=${keyword}`;
    try {
        if (Array.isArray(options) && options.length > 0) {
            const type = options.find((z) => z.type);
            const order = options.find((z) => z.sortBy);
            if (typeof type === "object") {
                if (typeof type.type == "string") {
                    switch (type.type.toLowerCase()) {
                        case "video":
                            endpoint = `${endpoint}&sp=EgQIAxAB%3D%3D`;
                            break;
                        case "channel":
                            endpoint = `${endpoint}&sp=EgIQAg%253D%253D`;
                            break;
                        case "playlist":
                            endpoint = `${endpoint}&sp=EgIQAw%253D%253D`;
                            break;
                        case "movie":
                            endpoint = `${endpoint}&sp=EgIQBA%3D%3D`;
                            break;
                    }
                }
            }
            if (typeof sortBy === 'object') {
                if (typeof sortBy.sortBy == "string") {
                    switch (sortBy.sortBy.toLowerCase()) {
                        case "relevance":
                            endpoint = `${endpoint}&sp=CAASAhAE`;
                        case "upload_date":
                            endpoint = `${endpoint}&sp=CAI%253D`;
                            break;
                        case "popular":
                            endpoint = `${endpoint}&sp=CAMSAhAB`;
                            break;
                        case "rating":
                            endpoint = `${endpoint}&sp=CAESAhAB`;
                            break;
                    }
                }
            }
        }

        const page = await GetYoutubeInitData(endpoint);

        const sectionListRenderer = await page.initData.contents
            .twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer;

        let items = [];

        await sectionListRenderer.contents.forEach((content) => {
            if (content.itemSectionRenderer) {
                content.itemSectionRenderer.contents.forEach((item) => {
                    
                    let videoRender = item.videoRenderer;
                    
                    if (videoRender && videoRender.videoId) {
                            items.push(parseVideoRender(videoRender));
                    }
                });
            }
        });

        const itemList = items.filter((x) => x.id != null)

        const itemsResult = itemList != 0 ? itemList.slice(0, limit) : itemList;
        return await Promise.resolve({
            items: itemsResult
        });
    } catch (ex) {
        console.error(ex);
        return await Promise.reject(ex);
    }
};

export const nextPage = async (nextPage, withPlaylist = false, limit = 0) => {
    const endpoint = `${youtubeEndpoint}/youtubei/v1/search?key=${nextPage.nextPageToken}`;
    try {
        const page = await axios.post(
            encodeURI(endpoint),
            nextPage.nextPageContext
        );
        const item1 =
            page.data.onResponseReceivedCommands[0].appendContinuationItemsAction;
        let items = [];
        item1.continuationItems.forEach((conitem) => {
            if (conitem.itemSectionRenderer) {
                conitem.itemSectionRenderer.contents.forEach((item, index) => {
                    let videoRender = item.videoRenderer;
                    let playListRender = item.playlistRenderer;
                    if (videoRender && videoRender.videoId) {
                        items.push(parseVideoRender(item));
                    }
                    if (withPlaylist) {
                        if (playListRender && playListRender.playlistId) {
                            items.push({
                                id: playListRender.playlistId,
                                type: "playlist",
                                thumbnail: playListRender.thumbnails,
                                title: playListRender.title.simpleText,
                                length: playListRender.videoCount,
                                videos: GetPlaylistData(playListRender.playlistId)
                            });
                        }
                    }
                });
            } else if (conitem.continuationItemRenderer) {
                nextPage.nextPageContext.continuation =
                    conitem.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
            }
        });
        const itemsResult = limit != 0 ? items.slice(0, limit) : items;
        return await Promise.resolve({ items: itemsResult, nextPage: nextPage });
    } catch (ex) {
        console.error(ex);
        return await Promise.reject(ex);
    }
};

export const GetPlaylistData = async (playlistId, limit = 0) => {
    const endpoint = await `${youtubeEndpoint}/playlist?list=${playlistId}`;
    try {
        const page = await GetYoutubeInitData(endpoint);
        const sectionListRenderer = await page.initData;

        const metadata = await sectionListRenderer?.header?.playlistHeaderRenderer;

        const banner = metadata?.playlistHeaderBanner?.heroPlaylistThumbnailRenderer?.thumbnail?.thumbnails;

        const channelUrl = metadata?.ownerText?.runs[0].navigationEndpoint?.commandMetadata?.webCommandMetadata?.url;

        if (sectionListRenderer && sectionListRenderer.contents) {
            const videoItems = await sectionListRenderer.contents
                .twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content
                .sectionListRenderer.contents[0].itemSectionRenderer.contents[0]
                .playlistVideoListRenderer.contents;
            let items = await [];
            await videoItems.forEach((item) => {
                let playListRender = item.playlistVideoRenderer;
                if (playListRender && playListRender.videoId) {
                    items.push(playListVideoItemRender(playListRender));
                }
            });
            const itemsResult = limit != 0 ? items.slice(0, limit) : items;
            return await Promise.resolve({
                id: playlistId,
                type: 'playlist',
                title: metadata?.title.simpleText,
                views: metadata?.viewCountText?.simpleText,
                videosCount: metadata?.numVideosText.runs?.map((x) => x.text).join(''),
                channel: {
                    title: metadata?.ownerText?.runs[0]?.text,
                    url: channelUrl,
                },
                banner,
                items: itemsResult, videoCount: itemsResult.length
            });
        } else {
            return await Promise.reject("invalid_playlist");
        }
    } catch (ex) {
        console.error(ex);
        return await Promise.reject(ex);
    }
};

/**
 * Get Home Feed
 * @param {*} limit 
 * @returns 
 */
export const GetSuggestData = async (limit = 0) => {
    const endpoint = `${youtubeEndpoint}`;
    try {
        const page = await GetYoutubeInitData(endpoint);

        if (!page.initData.contents?.twoColumnBrowseResultsRenderer) {
            return {};
        }

        const richGridRenderer = await page.initData.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer;

        const options = await richGridRenderer?.header?.feedFilterChipBarRenderer?.contents ?? [];

        const sectionListRenderer = await richGridRenderer.contents;
        const items = [];
        const otherItems = [];
        const chips = []

        await options.length && Array.isArray(options) && options.forEach((item) => {
            const chipItem = item?.chipCloudChipRenderer;

            const chipToken = chipItem?.navigationEndpoint?.continuationCommand?.token ?? null;

            const chipText = chipItem.text?.runs.map((x) => x.text).join('') ?? null;

            chips.push({
                title: chipText,
                nextPageToken: chipToken,
            });
        });

        await sectionListRenderer.forEach((item) => {
            if (item.richItemRenderer && item.richItemRenderer.content) {
                let videoRender = item.richItemRenderer.content.videoRenderer;
                if (videoRender && videoRender.videoId) {
                    items.push(parseVideoRender(videoRender));
                } else {
                    otherItems.push(videoRender);
                }
            }
        });
        const itemsResult = limit != 0 ? items.slice(0, limit) : items;
        return await Promise.resolve({ items: itemsResult, shorts: otherItems, chips, geoLocation: page.geoLocation });
    } catch (ex) {
        console.error(ex);
        return await Promise.reject(ex);
    }
};

export const GetChannelById = async (channelId) => {

    const parseChannelId = channelId.indexOf('@') !== -1 ? channelId : `@${channelId}`;

    const endpoint = `${youtubeEndpoint}/${parseChannelId}`;
    try {
        const page = await GetYoutubeInitData(endpoint);
        const tabs = page.initData.contents.twoColumnBrowseResultsRenderer.tabs;
        const metadata = page.initData.metadata.channelMetadataRenderer;
        const channelHeader = page.initData.header.pageHeaderRenderer.content.pageHeaderViewModel;


        let fullDescription = null;

        const getDescriptionToken = channelHeader?.description?.descriptionPreviewViewModel?.rendererContext?.commandContext?.onTap?.innertubeCommand?.showEngagementPanelEndpoint?.engagementPanel?.engagementPanelSectionListRenderer?.content?.sectionListRenderer?.contents[0]?.itemSectionRenderer?.contents[0]?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;

        if (getDescriptionToken) {

            const nextPageContext = { context: page.context, continuation: getDescriptionToken };

            const nextPage = { nextPageToken: page.apiToken, nextPageContext: nextPageContext }

            fullDescription = await getChannelFullDescription(nextPage)
        }

        const results = [];

        const featuredItems = []

        let verified = false;
        if (
            channelHeader?.title &&
            channelHeader?.title?.dynamicTextViewModel &&
            channelHeader?.title?.dynamicTextViewModel?.text &&
            channelHeader?.title?.dynamicTextViewModel?.text?.attachmentRuns &&
            channelHeader?.title?.dynamicTextViewModel?.text?.attachmentRuns?.length > 0 &&
            channelHeader?.title?.dynamicTextViewModel?.text?.attachmentRuns[0]?.element?.type?.imageType &&
            channelHeader?.title?.dynamicTextViewModel?.text?.attachmentRuns[0]?.element?.type?.imageType?.image &&
            channelHeader?.title?.dynamicTextViewModel?.text?.attachmentRuns[0]?.element?.type?.imageType?.image?.sources[0] &&
            channelHeader?.title?.dynamicTextViewModel?.text?.attachmentRuns[0]?.element?.type?.imageType?.image?.sources[0]?.clientResource &&
            channelHeader?.title?.dynamicTextViewModel?.text?.attachmentRuns[0]?.element?.type?.imageType?.image?.sources[0]?.clientResource?.imageName &&
            ["BADGE_STYLE_TYPE_VERIFIED", "CHECK_CIRCLE_FILLED"].includes(channelHeader?.title?.dynamicTextViewModel?.text?.attachmentRuns[0]?.element?.type?.imageType?.image?.sources[0]?.clientResource?.imageName)
        ) {
            verified = true;
        }

        let artist = false;

        if (
            channelHeader?.title &&
            channelHeader?.title?.dynamicTextViewModel &&
            channelHeader?.title?.dynamicTextViewModel?.text &&
            channelHeader?.title?.dynamicTextViewModel?.text?.attachmentRuns &&
            channelHeader?.title?.dynamicTextViewModel?.text?.attachmentRuns?.length > 0 &&
            channelHeader?.title?.dynamicTextViewModel?.text?.attachmentRuns[0]?.element?.type?.imageType &&
            channelHeader?.title?.dynamicTextViewModel?.text?.attachmentRuns[0]?.element?.type?.imageType?.image &&
            channelHeader?.title?.dynamicTextViewModel?.text?.attachmentRuns[0]?.element?.type?.imageType?.image?.sources[0] &&
            channelHeader?.title?.dynamicTextViewModel?.text?.attachmentRuns[0]?.element?.type?.imageType?.image?.sources[0]?.clientResource &&
            channelHeader?.title?.dynamicTextViewModel?.text?.attachmentRuns[0]?.element?.type?.imageType?.image?.sources[0]?.clientResource?.imageName &&
            ["MUSIC_FILLED", "OFFICIAL_ARTIST_BADGE", "BADGE_STYLE_TYPE_VERIFIED_ARTIST"].includes(channelHeader?.title?.dynamicTextViewModel?.text?.attachmentRuns[0]?.element?.type?.imageType?.image?.sources[0]?.clientResource?.imageName)
        ) {
            artist = true;
        }

        const banner = channelHeader?.banner?.imageBannerViewModel?.image?.sources;

        const channel = {
            id: metadata?.ownerUrls[0]?.split('@')[1],
            title: metadata.title,
            avatar: channelHeader?.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image?.sources.pop(),
            descriptionToken: getDescriptionToken,
            ...fullDescription,
            banner,
            verified,
            artist,
        }

        /**
         * Get Content of Channel
         */
        if (fullDescription.videos) {
            const items = tabs
                .map((json) => {
                    if (json && json.tabRenderer) {
                        const tabRenderer = json.tabRenderer;
                        const content = tabRenderer.content;
                        return content;
                    }
                })
                .filter((y) => typeof y !== "undefined")
                .map((x) => x?.sectionListRenderer?.contents).flat()
                .map((y) => y?.itemSectionRenderer?.contents).flat();



            items.length > 0 && items.map((x) => {

                if (x.channelFeaturedContentRenderer) {

                    const json = x.channelFeaturedContentRenderer;
                    json.items.map((x) => featuredItems.push(parseVideoRender(x.videoRenderer)));

                    results.push({
                        title: json.title?.runs.map((x) => x.text).join('') ?? null,
                        videos: featuredItems,
                    })
                }
                else if (x.shelfRenderer) {

                    const json = x.shelfRenderer;

                    const b = []
                    if (json.content.horizontalListRenderer) {
                        const itemList = json.content.horizontalListRenderer.items;

                        itemList.map((x) => {
                            if (x.gridVideoRenderer) {
                                b.push(gridParser(x, channel));
                            } else if (x.gridPlaylistRenderer) {
                                b.push(playListParser(x));
                            } else if (x.gridChannelRenderer) {
                                b.push(channelParser(x.gridChannelRenderer))
                            }

                        })
                    } else if (json.content.expandedShelfContentsRenderer) {

                        const itemList = json.content.expandedShelfContentsRenderer.items;

                        itemList.map((x) => {

                            if (x.channelRenderer) {
                                b.push(channelParser(x.channelRenderer))
                            }

                        });
                    }

                    results.push({ title: json.title.runs.map((x) => x.text).join(''), videos: b });

                }

                else if (x.reelShelfRenderer) {
                    const json = x.reelShelfRenderer;
                    const reels = [];

                    if (json.items) {
                        json.items.map((x) => {
                            const json = x.reelItemRenderer;

                            reels.push(shortVideoParser(json))
                        });
                    }

                    results.push({ title: json.title.runs.map((x) => x.text).join(''), videos: reels });
                }

            });
        }

        const channelJson = {
            ...channel,
            results,
        }

        return await Promise.resolve(channelJson);
    } catch (ex) {
        return await Promise.reject(ex);
    }
};


const getChannelFullDescription = async (nextPage) => {
    const endpoint = `${youtubeEndpoint}/youtubei/v1/browse?prettyPrint=true`;

    try {
        const page = await axios.post(
            encodeURI(endpoint),
            nextPage.nextPageContext
        );

        const response = page.data.onResponseReceivedEndpoints;

        if (!response) {
            return response;
        }

        const itemList = response[0]?.appendContinuationItemsAction;

        if (!itemList?.continuationItems) {
            return response;
        }


        const aboutChannel = itemList?.continuationItems[0]?.aboutChannelRenderer?.metadata?.aboutChannelViewModel;

        let links = null

        if (Array.isArray(aboutChannel.links)) {
            links = aboutChannel?.links.map((l) => {

                const link = l.channelExternalLinkViewModel;
                const img = link?.favicon?.sources && link?.favicon?.sources?.map((x) => x.url) || null;

                return {
                    title: link?.title?.content,
                    url: link?.link?.content,
                    icon: img,
                }
            })
        }

        return Promise.resolve({
            id: aboutChannel?.canonicalChannelUrl?.split('@')[1],
            description: aboutChannel?.description,
            country: aboutChannel?.country,
            subscriber: aboutChannel?.subscriberCountText,
            views: aboutChannel?.viewCountText,
            joinAt: aboutChannel?.joinedDateText?.content,
            videos: aboutChannel?.videoCountText,
            links,
        })
    } catch (ex) {
        return await Promise.reject(ex);
    }
}

export const GetVideoDetails = async (videoId) => {
    const endpoint = `${youtubeEndpoint}/watch?v=${videoId}`;
    try {
        const page = await GetYoutubeInitData(endpoint);

        const result = await page.initData.contents.twoColumnWatchNextResults;
        const playerData = await page.playerData;

        let videoInfo = null, channelInfo = null, contToken = null;

        await result.results.results.contents.forEach((content) => {
            if (content.itemSectionRenderer?.contents[0].continuationItemRenderer) {
                contToken = content.itemSectionRenderer?.contents[0].continuationItemRenderer
                    .continuationEndpoint.continuationCommand.token;
            } else if (content.videoPrimaryInfoRenderer) {
                videoInfo = content.videoPrimaryInfoRenderer;
            } else if (content.videoSecondaryInfoRenderer) {
                channelInfo = content.videoSecondaryInfoRenderer;
            }
        });
        const apiToken = await page.apiToken;
        const context = await page.context;
        const nextPageContext = { context: context, continuation: contToken };

        const nextPage = { nextPageToken: apiToken, nextPageContext: nextPageContext }

        let isLive = false;
        if (videoInfo?.viewCount?.videoViewCountRenderer?.hasOwnProperty("isLive")) {
            isLive = true;
        }


        const likeContainer = videoInfo?.videoActions?.menuRenderer?.topLevelButtons[0]?.segmentedLikeDislikeButtonViewModel;

        const likeCount = likeContainer?.likeButtonViewModel?.likeButtonViewModel?.toggleButtonViewModel?.toggleButtonViewModel?.defaultButtonViewModel?.buttonViewModel?.title ||
            0;

        const viewCount = isLive ? videoInfo?.viewCount?.videoViewCountRenderer?.viewCount?.runs?.map((x) => x.text).join('') :
            videoInfo?.viewCount?.videoViewCountRenderer?.shortViewCount?.simpleText || videoInfo?.viewCount?.videoViewCountRenderer?.extraShortViewCount?.simpleText || 0;

        const suggestionList = [];
        let suggestionToken = null;

        const suggestionListContainer = result.secondaryResults.secondaryResults.results;

        for (const conitem of suggestionListContainer) {

            if (conitem.compactVideoRenderer) {
                suggestionList.push(compactVideoRenderer(conitem));
            } else if (conitem.continuationItemRenderer) {
                suggestionToken = conitem.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
            }

        }

        const suggestionContext = { context: context, continuation: suggestionToken };

        const suggestionNextPage = { nextPageToken: apiToken, nextPageContext: suggestionContext }

        const channelUrl = channelInfo.owner.videoOwnerRenderer.navigationEndpoint.commandMetadata.webCommandMetadata.url;

        const channel = {
            id: channelUrl ? channelUrl?.replace('/@', '') : '',
            title: channelInfo.owner.videoOwnerRenderer.title.runs[0].text,
            url: channelUrl ? channelUrl?.replace('/@', '/channel/') : '',
            subscriber: channelInfo.owner.videoOwnerRenderer.subscriberCountText.simpleText,
            avatar: channelInfo.owner.videoOwnerRenderer.thumbnail.thumbnails,
        }

        const player = getVideoData(playerData);

        const res = {
            id: videoId,
            title: videoInfo.title.runs[0].text,
            views: viewCount,
            likes: likeCount,
            publishedAt: isLive ? videoInfo?.dateText?.simpleText : videoInfo?.relativeDateText?.simpleText,
            description: player.shortDescription ?? channelInfo.attributedDescription.content,
            channel,
        }

        return await Promise.resolve(res);
    } catch (ex) {
        return await Promise.reject(ex);
    }
};


export const GetVideoRelated = async (videoId) => {
    const endpoint = `${youtubeEndpoint}/watch?v=${videoId}`;
    try {
        const page = await GetYoutubeInitData(endpoint);

        const result = await page.initData.contents.twoColumnWatchNextResults;
        const playerData = await page.playerData;

        let videoInfo = null, channelInfo = null, contToken = null;

        await result.results.results.contents.forEach((content) => {
            if (content.itemSectionRenderer?.contents[0].continuationItemRenderer) {
                contToken = content.itemSectionRenderer?.contents[0].continuationItemRenderer
                    .continuationEndpoint.continuationCommand.token;
            } else if (content.videoPrimaryInfoRenderer) {
                videoInfo = content.videoPrimaryInfoRenderer;
            } else if (content.videoSecondaryInfoRenderer) {
                channelInfo = content.videoSecondaryInfoRenderer;
            }
        });
        const apiToken = await page.apiToken;
        const context = await page.context;
        const nextPageContext = { context: context, continuation: contToken };

        const nextPage = { nextPageToken: apiToken, nextPageContext: nextPageContext }

        let isLive = false;
        if (videoInfo?.viewCount?.videoViewCountRenderer?.hasOwnProperty("isLive")) {
            isLive = true;
        }


        const likeContainer = videoInfo?.videoActions?.menuRenderer?.topLevelButtons[0]?.segmentedLikeDislikeButtonViewModel;

        const likeCount = likeContainer?.likeButtonViewModel?.likeButtonViewModel?.toggleButtonViewModel?.toggleButtonViewModel?.defaultButtonViewModel?.buttonViewModel?.title ||
            0;

        const viewCount = isLive ? videoInfo?.viewCount?.videoViewCountRenderer?.viewCount?.runs?.map((x) => x.text).join('') :
            videoInfo?.viewCount?.videoViewCountRenderer?.shortViewCount?.simpleText || videoInfo?.viewCount?.videoViewCountRenderer?.extraShortViewCount?.simpleText || 0;

        const suggestionList = [];
        let suggestionToken = null;

        const suggestionListContainer = result.secondaryResults.secondaryResults.results;

        for (const conitem of suggestionListContainer) {

            if (conitem.compactVideoRenderer) {
                suggestionList.push(compactVideoRenderer(conitem));
            } else if (conitem.continuationItemRenderer) {
                suggestionToken = conitem.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
            }

        }

        const suggestionContext = { context: context, continuation: suggestionToken };

        const suggestionNextPage = { nextPageToken: apiToken, nextPageContext: suggestionContext }

        const channelUrl = channelInfo.owner.videoOwnerRenderer.navigationEndpoint.commandMetadata.webCommandMetadata.url;

        const channel = {
            id: channelUrl ? channelUrl?.replace('/@', '') : '',
            title: channelInfo.owner.videoOwnerRenderer.title.runs[0].text,
            url: channelUrl ? channelUrl?.replace('/@', '/channel/') : '',
            subscriber: channelInfo.owner.videoOwnerRenderer.subscriberCountText.simpleText,
            avatar: channelInfo.owner.videoOwnerRenderer.thumbnail.thumbnails,
        }

        const player = getVideoData(playerData);

        const res = {
            suggestion: suggestionList,
        }

        return await Promise.resolve(res);
    } catch (ex) {
        return await Promise.reject(ex);
    }
};

export const getComments = async (nextPage) => {
    const endpoint = `${youtubeEndpoint}/youtubei/v1/next?key=${nextPage.nextPageToken}`;
    const items = [];

    try {
        const page = await axios.post(
            encodeURI(endpoint),
            nextPage.nextPageContext
        );

        const response = page.data.onResponseReceivedEndpoints;

        if (!response) return [];

        const commentHeader = response[0]?.reloadContinuationItemsCommand?.continuationItems[0]?.commentsHeaderRenderer;

        const commentCounts = commentHeader?.countText?.runs?.map(x => x.text).join('');

        let commentKeys = [];

        try {
            commentKeys = response[1]?.reloadContinuationItemsCommand.continuationItems.filter((x) => x.commentThreadRenderer).map((x) => {
                const reply = x.commentThreadRenderer.replies || null;
                const c = x.commentThreadRenderer.commentViewModel.commentViewModel;

                let token = null;
                if (reply) {
                    token = reply.commentRepliesRenderer.contents[0].continuationItemRenderer.continuationEndpoint.continuationCommand.token;
                }

                return {
                    id: c.commentId,
                    replyToken: token,
                }

            });
        } catch (error) {
            console.log(error);
        }

        const getItemList = page.data?.frameworkUpdates?.entityBatchUpdate?.mutations || null;

        if (!getItemList) {
            return [];
        }

        const itemList = getItemList.filter((x => x.payload.commentEntityPayload));

        for (const conitem of itemList) {

            const commentThread = conitem.payload.commentEntityPayload;

            if (commentThread) {

                const comment = commentThread.properties;
                const commentStats = commentThread.toolbar;

                const verified = commentThread.author.isVerified;
                const artist = commentThread.author.isArtist;

                const foundToken = commentKeys.find((x) => x.id === comment.commentId)
                const repliesToken = foundToken?.replyToken || null;

                const channelUrl = commentThread.author.channelCommand.innertubeCommand.commandMetadata.webCommandMetadata.url?.replace('/', '');

                const channel = {
                    id: channelUrl ? channelUrl?.replace('@', '') : '',
                    title: channelUrl,
                    url: channelUrl ? channelUrl?.replace('@', '/channel/') : '',
                    avatar: commentThread.author.avatarThumbnailUrl,
                    verified,
                    artist,
                };

                const commentItem = {
                    id: comment.commentId,
                    channel,
                    isOwner: commentThread.author.isCreator,
                    content: comment.content?.content,
                    publishedAt: comment.publishedTime,
                    likes: commentStats.likeCountLiked,
                    replyCount: commentStats.replyCount,
                    repliesToken,
                }

                if (repliesToken) {

                    const replyContext = {
                        context: nextPage.nextPageContext.context,
                        continuation: repliesToken
                    };

                    const replyNextPage = { nextPageToken: nextPage.nextPageToken, nextPageContext: replyContext }

                    const replies = await getCommentReplies(replyNextPage);

                    commentItem.replies = replies;
                }

                items.push(commentItem);

            } else if (conitem.continuationItemRenderer) {
                nextPage.nextPageContext.continuation = conitem.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
            }
        }

        return await Promise.resolve({ text: commentCounts, items, nextPage: nextPage });
    } catch (ex) {
        console.error(ex);
        return await Promise.reject([]);
    }
};

export const getMoreSuggestions = async (nextPage) => {
    const items = [];

    if (!nextPage?.nextPageToken) return Promise.resolve(nextPage);

    try {
        const endpoint = await `${youtubeEndpoint}/youtubei/v1/next?key=${nextPage.nextPageToken}`;

        const page = await axios.post(
            encodeURI(endpoint),
            nextPage.nextPageContext
        );

        const response = page.data.onResponseReceivedEndpoints;

        if (!response) return [];

        const itemList = response[0]?.appendContinuationItemsAction;

        if (!itemList?.continuationItems) {
            return response;
        }

        for (const conitem of itemList.continuationItems) {

            if (conitem.compactVideoRenderer) {
                items.push(compactVideoRenderer(conitem));
            } else if (conitem.continuationItemRenderer) {
                nextPage.nextPageContext.continuation = conitem.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
            }

        }

        return await Promise.resolve({ items, nextPage: nextPage });
    } catch (ex) {
        console.error(ex);
        return await Promise.reject([]);
    }
}

export const getMoreComments = async (nextPage) => {

    if (!nextPage?.nextPageToken) return Promise.resolve(nextPage);

    const endpoint = await `${youtubeEndpoint}/youtubei/v1/next?key=${nextPage.nextPageToken}`;
    const items = [];

    try {
        const page = await axios.post(
            encodeURI(endpoint),
            nextPage.nextPageContext
        );

        const response = page.data.onResponseReceivedEndpoints;

        if (!response) return [];

        const commentHeader = response[0]?.reloadContinuationItemsCommand?.continuationItems[0]?.commentsHeaderRenderer;

        const commentKeys = [];

        try {
            response[1]?.reloadContinuationItemsCommand.continuationItems.filter((x) => x.commentThreadRenderer).map((x) => {
                const reply = x.commentThreadRenderer.replies || null;
                const c = x.commentThreadRenderer.commentViewModel.commentViewModel;

                let token = null;
                if (reply) {
                    token = reply.commentRepliesRenderer.contents[0].continuationItemRenderer.continuationEndpoint.continuationCommand.token;
                }

                commentKeys.push({
                    id: c.commentId,
                    replyToken: token,
                })

            });
        } catch (error) {
            console.log(error);
        }

        const getItemList = page.data?.frameworkUpdates?.entityBatchUpdate?.mutations || null;

        if (!getItemList) {
            return [];
        }

        const itemList = getItemList.filter((x => x.payload.commentEntityPayload));

        for (const conitem of itemList) {

            const commentThread = conitem.payload.commentEntityPayload;

            if (commentThread) {

                const comment = commentThread.properties;
                const commentStats = commentThread.toolbar;

                const verified = commentThread.author.isVerified;
                const artist = commentThread.author.isArtist;

                const foundToken = commentKeys.length ? commentKeys.find((x) => x.id === comment.commentId) : undefined
                const repliesToken = foundToken?.replyToken || null;

                const channelUrl = commentThread.author.channelCommand.innertubeCommand.commandMetadata.webCommandMetadata.url?.replace('/', '');

                const channel = {
                    id: channelUrl ? channelUrl?.replace('@', '') : '',
                    title: channelUrl,
                    url: channelUrl ? channelUrl?.replace('@', '/channel/') : '',
                    avatar: commentThread.author.avatarThumbnailUrl,
                    verified,
                    artist,
                };

                const commentItem = {
                    id: comment.commentId,
                    channel,
                    isOwner: commentThread.author.isCreator,
                    content: comment.content?.content,
                    publishedAt: comment.publishedTime,
                    likes: commentStats.likeCountLiked,
                    replyCount: commentStats.replyCount,
                    repliesToken,
                }

                if (repliesToken) {

                    const replyContext = {
                        context: nextPage.nextPageContext.context,
                        continuation: repliesToken
                    };

                    const replyNextPage = { nextPageToken: nextPage.nextPageToken, nextPageContext: replyContext }

                    const replies = await getMoreComments(replyNextPage);

                    commentItem.replies = replies;
                }

                items.push(commentItem);

            } else if (conitem.continuationItemRenderer) {
                nextPage.nextPageContext.continuation = conitem.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
            }
        }

        return await Promise.resolve({ items, nextPage: nextPage });

    } catch (ex) {
        console.error(ex);
        return await Promise.reject([]);
    }
};

async function getCommentReplies(nextPage) {
    const endpoint = `${youtubeEndpoint}/youtubei/v1/next?key=${nextPage.nextPageToken}`;
    const items = [];

    try {
        const page = await axios.post(
            encodeURI(endpoint),
            nextPage.nextPageContext
        );

        const response = page.data.onResponseReceivedEndpoints;

        if (!response) return [];

        const commentHeader = response[0]?.reloadContinuationItemsCommand?.continuationItems[0]?.commentsHeaderRenderer;

        const commentCounts = commentHeader?.countText?.runs?.map(x => x.text).join('');

        const commentKeys = [];

        try {
            response[1]?.reloadContinuationItemsCommand.continuationItems.filter((x) => x.commentThreadRenderer).map((x) => {
                const reply = x.commentThreadRenderer.replies || null;
                const c = x.commentThreadRenderer.commentViewModel.commentViewModel;

                let token = null;
                if (reply) {
                    token = reply.commentRepliesRenderer.contents[0].continuationItemRenderer.continuationEndpoint.continuationCommand.token;
                }

                commentKeys.push({
                    id: c.commentId,
                    replyToken: token,
                });

            });
        } catch (error) {
            console.log(error);
        }

        const getItemList = page.data?.frameworkUpdates?.entityBatchUpdate?.mutations || null;

        if (!getItemList) {
            return [];
        }

        const itemList = getItemList.filter((x => x.payload.commentEntityPayload));

        // return itemList;

        for (const conitem of itemList) {

            const commentThread = conitem.payload.commentEntityPayload;

            if (commentThread) {



                const comment = commentThread.properties;
                const commentStats = commentThread.toolbar;

                const verified = commentThread.author.isVerified;
                const artist = commentThread.author.isArtist;

                const foundToken = commentKeys.find((x) => x.id === comment.commentId)
                const repliesToken = foundToken?.replyToken;

                const channelUrl = commentThread.author.channelCommand.innertubeCommand.commandMetadata.webCommandMetadata.url?.replace('/', '');

                const channel = {
                    id: channelUrl ? channelUrl?.replace('@', '') : '',
                    title: channelUrl,
                    url: channelUrl ? channelUrl?.replace('@', '/channel/') : '',
                    avatar: commentThread.author.avatarThumbnailUrl,
                    verified,
                    artist,
                };

                const commentItem = {
                    id: comment.commentId,
                    channel,
                    isOwner: commentThread.author.isCreator,
                    content: comment.content?.content,
                    publishedAt: comment.publishedTime,
                    likes: commentStats.likeCountLiked,
                    replyCount: commentStats.replyCount,
                    repliesToken,
                }

                if (repliesToken) {

                    const replyContext = {
                        context: nextPage.nextPageContext.context,
                        continuation: repliesToken
                    };

                    const replyNextPage = { nextPageToken: nextPage.nextPageToken, nextPageContext: replyContext }

                    const replies = await getCommentReplies(replyNextPage);

                    commentItem.replies = replies;
                }

                items.push(commentItem);

            } else if (conitem.continuationItemRenderer) {
                nextPage.nextPageContext.continuation = conitem.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
            }
        }

        return await Promise.resolve({ text: commentCounts, items, nextPage: nextPage });
    } catch (ex) {
        console.error(ex);
        return await Promise.reject([]);
    }

}

/**
 * 
 * @param {*} json 
 * @returns []
 */
export async function getAutoCompleteSearch(keyword) {
    const searchUrl = `${apiList.autoComplete}&q=${keyword}`;

    const list = []

    try {

        const page = await axios.get(searchUrl);

        const response = page.data;

        if (response) {
            Object.values(response[1]).map((x) => list.push(x[0]));
        }

        return Promise.resolve(list);
    } catch (error) {
        return Promise.reject(error);
    }
}

export const VideoRender = (json) => {

    try {
        if (json && (json.videoRenderer || json.playlistVideoRenderer)) {
            let videoRenderer = null;
            if (json.videoRenderer) {
                videoRenderer = json.videoRenderer;
            } else if (json.playlistVideoRenderer) {
                videoRenderer = json.playlistVideoRenderer;
            }
            let isLive = false;
            if (
                videoRenderer.badges &&
                videoRenderer.badges.length > 0 &&
                videoRenderer.badges[0].metadataBadgeRenderer &&
                videoRenderer.badges[0].metadataBadgeRenderer.style ===
                "BADGE_STYLE_TYPE_LIVE_NOW"
            ) {
                isLive = true;
            }
            if (videoRenderer.thumbnailOverlays) {
                videoRenderer.thumbnailOverlays.forEach((item) => {
                    if (
                        item.thumbnailOverlayTimeStatusRenderer &&
                        item.thumbnailOverlayTimeStatusRenderer.style &&
                        item.thumbnailOverlayTimeStatusRenderer.style === "LIVE"
                    ) {
                        isLive = true;
                    }
                });
            }
            const id = videoRenderer.videoId;
            const thumbnails = videoRenderer.thumbnail;
            const title = videoRenderer.title.runs[0].text;
            const shortBylineText = videoRenderer.shortBylineText ? videoRenderer.shortBylineText : "";
            const lengthText = videoRenderer.lengthText ? videoRenderer.lengthText : "";
            const channelTitle = videoRenderer.ownerText && videoRenderer.ownerText.runs ? videoRenderer.ownerText.runs[0].text : "";

            const views = videoRenderer.viewCountText ? videoRenderer.viewCountText?.simpleText : '';

            return {
                id,
                type: "video",
                ...thumbnails,
                title,
                channelTitle,
                shortBylineText,
                stats: {
                    views,
                },
                length: lengthText,
                isLive
            };
        } else {
            return {};
        }
    } catch (ex) {
        throw ex;
    }
};

export const compactVideoRenderer = (json) => {
    const compactVideoRendererJson = json.compactVideoRenderer;

    let isLive = false;
    if (
        compactVideoRendererJson.badges &&
        compactVideoRendererJson.badges.length > 0 &&
        compactVideoRendererJson.badges[0].metadataBadgeRenderer &&
        compactVideoRendererJson.badges[0].metadataBadgeRenderer.style ===
        "BADGE_STYLE_TYPE_LIVE_NOW"
    ) {
        isLive = true;
    }

    let badges = [];
    if (
        compactVideoRendererJson.badges &&
        compactVideoRendererJson.badges.length > 0) {
        badges = compactVideoRendererJson.badges.map((x) => x.metadataBadgeRenderer.label);
        badges = badges.filter((x) => x.toLowerCase() !== 'live');
    }

    let verified = false;
    if (
        compactVideoRendererJson.ownerBadges &&
        compactVideoRendererJson.ownerBadges.length > 0 &&
        compactVideoRendererJson.ownerBadges[0].metadataBadgeRenderer &&
        compactVideoRendererJson.ownerBadges[0].metadataBadgeRenderer.style ===
        "BADGE_STYLE_TYPE_VERIFIED"
    ) {
        verified = true;
    }

    const viewsCount = isLive ? compactVideoRendererJson.shortViewCountText?.runs?.map((x) => x.text).join('') : compactVideoRendererJson.shortViewCountText?.simpleText;

    const channelUrl = compactVideoRendererJson.shortBylineText.runs[0].navigationEndpoint.commandMetadata.webCommandMetadata.url;
    const channelAvatar = compactVideoRendererJson.channelThumbnail.thumbnails[0];

    const channel = {
        id: channelUrl ? channelUrl?.replace('/@', '') : '',
        title: compactVideoRendererJson.shortBylineText.runs[0].text,
        url: channelUrl ? channelUrl?.replace('/@', '/channel/') : '',
        avatar: channelAvatar,
        verified,
    };

    const result = {
        id: compactVideoRendererJson.videoId,
        type: "video",
        thumbnails: compactVideoRendererJson.thumbnail.thumbnails,
        title: compactVideoRendererJson.title?.simpleText,
        channel,
        length: compactVideoRendererJson?.lengthText?.simpleText,
        views: viewsCount,
        publishedAt: compactVideoRendererJson?.publishedTimeText?.simpleText,
        badges,
        isLive,
    };

    return result;
};


export async function getTrending() {
    const page = await GetYoutubeInitData(apiList['trending']);

    try {

        const contentHeader = await page.initData?.header?.c4TabbedHeaderRenderer;
        const results = await page.initData.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content;
        const items = results.sectionListRenderer.contents
            .filter((x) => x.itemSectionRenderer)
            .map((z) => z.itemSectionRenderer.contents).flat();

        let itemList = [];
        const otherItems = [];
        const shortsList = [];

        items.length && items.map((x) => {

            if (x.shelfRenderer) {
                itemList = parseTrending(x.shelfRenderer.content);
            } else if (x.reelShelfRenderer) {
                const shortsResult = x.reelShelfRenderer.items;
                shortsResult.map(({ reelItemRenderer: json }) => shortsList.push({
                    id: json.videoId,
                    type: "reel",
                    thumbnail: json.thumbnail.thumbnails[0],
                    title: json.headline.simpleText,
                }));
            } else {
                return [];
            }

        })

        return {
            title: contentHeader?.title,
            avatar: contentHeader?.avatar?.thumbnails[0],
            items: itemList,
            shorts: shortsList,
            otherItems,
        };


    } catch (error) {
        return await Promise.reject(error);
    }
}

export async function getFeed(name) {
    const endpoint = name ? apiList[name] : youtubeEndpoint;

    const page = await GetYoutubeInitData(endpoint);

    const contentHeader = await page.initData?.header?.c4TabbedHeaderRenderer || page.initData?.header?.carouselHeaderRenderer;

    let headerItems = {}

    if (contentHeader?.contents) {

        contentHeader.contents.map((x) => {

            if (x.carouselItemRenderer) {
                const carouselItems = x.carouselItemRenderer.carouselItems;

                const promo = carouselItems.map((x) => {

                    const promo = x.defaultPromoPanelRenderer;

                    return {
                        title: promo.title?.title?.runs?.map((x) => x.text).join(''),
                        description: promo.description?.runs?.map((x) => x.text).join(''),
                        url: promo?.navigationEndpoint?.commandMetadata?.webCommandMetadata.url?.split('v=')[1],
                    };
                });

                headerItems.promo = promo;
            } else if (x.topicChannelDetailsRenderer) {
                const topicChannelDetailsRenderer = x.topicChannelDetailsRenderer;

                headerItems.title = topicChannelDetailsRenderer?.title?.simpleText;
                headerItems.avatar = topicChannelDetailsRenderer?.avatar?.thumbnails?.pop();
                headerItems.subscriber = topicChannelDetailsRenderer?.subtitle?.simpleText;
            }

            return headerItems;
        });
    } else {


        headerItems = {
            title: contentHeader?.title,
            subtitle: contentHeader?.subscriberCountText?.runs?.map((x) => x.text)?.join(''),
            avatar: contentHeader?.avatar?.thumbnails[0],
        }

    }

    const results = await page.initData.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content;

    let feedResults = [];

    if (results.richGridRenderer) {

        const richGridRenderer = results.richGridRenderer.contents;

        richGridRenderer.map((x) => {

            if (x.richSectionRenderer) {

                const richContent = x.richSectionRenderer.content;

                const title = richContent.richShelfRenderer?.title?.simpleText || richContent.richShelfRenderer?.title?.runs?.map((x) => x.text).join('')

                const subtitle = richContent.richShelfRenderer?.subtitle?.runs?.map((x) => x.text).join('')
                const richItemRenderer = richContent.richShelfRenderer.contents.map((x) => x.richItemRenderer);

                const items = richItemRenderer.map((x) => {

                    const richItemContent = x.content;

                    let item;

                    if (richItemContent.playlistRenderer) {
                        const json = richItemContent.playListRender;

                        item = feedParser(richItemContent);

                    } else if (richItemContent.videoRenderer) {
                        item = parseVideoRender(richItemContent.videoRenderer)
                    } else if (richItemContent.postRenderer) {
                        item = parsePostRenderer(richItemContent.postRenderer);
                    }

                    return item;

                });

                feedResults.push({
                    title,
                    subtitle,
                    items
                });

            } else if (x.richItemRenderer) {
                const richItemRenderer = x.richItemRenderer.content;

                feedResults.push(parseVideoRender(richItemRenderer.videoRenderer));
            }

        })

    } else if (results.sectionListRenderer) {

        const itemSectionRenderer = results.sectionListRenderer.contents.map((x) => x?.itemSectionRenderer) ?? [];

        const itemSectionContent = itemSectionRenderer.filter((x) => x)?.map((x) => x.contents)?.flat();

        itemSectionContent.map((x) => {

            if (x.horizontalCardListRenderer) {

                const horizontalCardListRenderer = x.horizontalCardListRenderer;

                const cardHeader = horizontalCardListRenderer.header?.richListHeaderRenderer;

                const title = cardHeader?.title?.simpleText || cardHeader?.title?.runs?.map((x) => x.text).join('')

                const subtitle = cardHeader?.subtitle?.simpleText || cardHeader?.subtitle?.runs?.map((x) => x.text).join('');

                const items = feedParser(x);

                feedResults.push({
                    title,
                    subtitle,
                    items
                })

            } else if (x.shelfRenderer) {

                const shelfRenderer = x.shelfRenderer;

                const title = shelfRenderer?.title?.simpleText || shelfRenderer?.title?.runs?.map((x) => x.text).join('')

                const subtitle = shelfRenderer?.subtitle?.simpleText || shelfRenderer?.subtitle?.runs?.map((x) => x.text).join('')

                const items = feedParser(shelfRenderer.content);

                feedResults.push({
                    title,
                    subtitle,
                    items,
                });

            } else if (x.reelShelfRenderer) {
                const shelfRenderer = x.reelShelfRenderer;

                const title = shelfRenderer?.title?.simpleText || shelfRenderer?.title?.runs?.map((x) => x.text).join('')

                const items = shelfRenderer.items.map((x) => shortVideoParser(x.reelItemRenderer))

                feedResults.push({
                    title,
                    items,
                });

            }

        })

    }

    return await Promise.resolve({
        ...headerItems,
        items: feedResults,

    });
}

export const GetHomeFeed = async () => {
    const page = await GetYoutubeInitData(youtubeEndpoint);

    const results = await page.initData.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content

    const richGridRenderer = results.richGridRenderer;

    const chips = [];

    const options = await richGridRenderer?.header?.feedFilterChipBarRenderer?.contents ?? [];

    await options.length && Array.isArray(options) && options.forEach((item) => {
        const chipItem = item?.chipCloudChipRenderer;

        const chipToken = chipItem?.navigationEndpoint?.continuationCommand?.token ?? null;

        const chipText = chipItem.text?.runs.map((x) => x.text).join('') ?? null;

        chips.push({
            title: chipText,
            nextPageToken: chipToken,
        });
    });

    const itemList = []

    let contToken = '';

    const items = richGridRenderer.contents;

    items.map((x) => {

        if (x.continuationItemRenderer) {
            contToken = x.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
        } else {
            itemList.push(richSessionParse(x));
        }
    });

    const newList = itemList.filter((x) => x);

    return await Promise.resolve({ items: newList, chips, nextPageToken: contToken });

};


export const GetShortVideo = async () => {
    const page = await GetYoutubeInitData(youtubeEndpoint);
    const shortResult =
        await page.initData.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer.contents
            .filter((x) => {
                return x.richSectionRenderer;
            })
            .map((z) => z.richSectionRenderer.content)
            .filter((y) => y.richShelfRenderer)
            .map((u) => u.richShelfRenderer)
            .find((i) => i.title.runs[0].text === "Shorts");
    const res = await shortResult.contents
        .map((z) => z.richItemRenderer)
        .map((y) => y.content.reelItemRenderer);
    return await res.map((x) => ({
        id: x.videoId,
        type: "reel",
        thumbnail: x.thumbnail?.thumbnails[0],
        title: x.headline?.simpleText,
        views: x.viewCountText?.simpleText,
    }));
};


function getVideoData(response) {

    if (!response) {
        return {};
    }

    try {

        const microFormat = response.microformat.playerMicroformatRenderer;
        const videoDetails = response.videoDetails;
        const adaptiveFormats = response.streamingData.adaptiveFormats;
        const formats = response.streamingData.formats;
        const player = {
            id: videoDetails.videoId,
            title: videoDetails.title,
            thumbnails: videoDetails.thumbnail.thumbnails,
            shortDescription: videoDetails.shortDescription,
            length: videoDetails.lengthSeconds,
            keywords: videoDetails.keywords,
            category: microFormat.category,
            publishDate: microFormat.publishDate,
            embed: microFormat.embed,
            media: [],
            formats,
            adaptiveFormats,
        };

        formats.length && formats.map((x) => {

            const mime = x.mimeType?.split(/\/(.*?);/u);
            const parsedUrl = x.url ?? decodeURI(x?.signatureCipher?.split('&url=')[1] ?? '');

            player.media.push({
                url: parsedUrl,
                hls: videoDetails.isLive ? response.streamingData.hlsManifestUrl : null,
                fileType: mime[1] ?? null,
                type: mime.includes('audio') ? 'audio' : 'video',
                label: x.qualityLabel ?? x?.quality,
                width: x.width,
                height: x.height,
            })
        })

        return player;

    } catch (error) {
        return {};
    }
}


/**
 * Helper function for parser
 */

function parseComments(response) {
    if (!response) {
        return response;
    }
}

/**
 * parse Video Container
 * @param {*} response 
 * @returns object
 */
export function parseVideoRender(response) {

    if (!response?.videoId) {
        return response;
    }

    try {

        let isLive = false;
        if (
            response.badges &&
            response.badges.length > 0 &&
            response.badges[0].metadataBadgeRenderer &&
            response.badges[0].metadataBadgeRenderer.style ===
            "BADGE_STYLE_TYPE_LIVE_NOW"
        ) {
            isLive = true;
        }
        if (response.thumbnailOverlays) {
            response.thumbnailOverlays.forEach((item) => {
                if (
                    item.thumbnailOverlayTimeStatusRenderer &&
                    item.thumbnailOverlayTimeStatusRenderer.style &&
                    item.thumbnailOverlayTimeStatusRenderer.style === "LIVE"
                ) {
                    isLive = true;
                }
            });
        }

        let badges = [];
        if (
            response.badges &&
            response.badges.length > 0) {
            badges = response.badges.map((x) => x.metadataBadgeRenderer.label);
            badges = badges.filter((x) => x.toLowerCase() !== 'live');
        }

        let verified = false;
        if (
            response.ownerBadges &&
            response.ownerBadges.length > 0 &&
            response.ownerBadges[0].metadataBadgeRenderer &&
            response.ownerBadges[0].metadataBadgeRenderer.style ===
            "BADGE_STYLE_TYPE_VERIFIED"
        ) {
            verified = true;
        }

        const channelUrl = response.ownerText.runs[0].navigationEndpoint.commandMetadata.webCommandMetadata.url;
        const channelAvatar = response.channelThumbnailSupportedRenderers.channelThumbnailWithLinkRenderer.thumbnail.thumbnails[0];

        const channel = {
            id: channelUrl ? channelUrl?.replace('/@', '') : '',
            title: response.ownerText.runs[0].text,
            url: channelUrl ? channelUrl?.replace('/@', '/channel/') : '',
            avatar: channelAvatar,
            verified,
        };

        const hasDescription = response.hasOwnProperty('detailedMetadataSnippets');
        const hasDescriptionSnippet = response.hasOwnProperty('descriptionSnippet');

        const descriptionSnippet = hasDescription ? response?.detailedMetadataSnippets[0].snippetText?.runs?.map((x) => x.text).join('') : false;

        const descriptionTwoSnippet = hasDescriptionSnippet ? response.descriptionSnippet?.runs?.map((x) => x.text).join('') : false;

        const viewsCount = isLive ? response.shortViewCountText?.runs?.map((x) => x.text).join('') : response.shortViewCountText?.simpleText;

        const description = descriptionSnippet || descriptionTwoSnippet || '';

        const result = {
            id: response.videoId,
            type: isLive ? "Live" : "video",
            title: response.title.runs[0].text,
            description,
            channel,
            length: response.lengthText?.simpleText,
            views: viewsCount,
            publishedAt: isLive ? response?.dateText?.simpleText : response?.publishedTimeText?.simpleText,
            thumbnails: response?.thumbnail?.thumbnails,
            isLive,
            badges,
        };

        return result;
    } catch (error) {
        return error;
    }
}

/**
 * Parse Short Video
 * @param {*} response 
 * @returns 
 */
function parseShortVideo(results) {

    try {
        const shortResponse = results.contents
            .map((z) => z.richItemRenderer)
            .map((y) => y.content.reelItemRenderer);

        const shorts = shortResponse.map((json) => ({
            id: json.videoId,
            type: "reel",
            thumbnail: json.thumbnail.thumbnails[0],
            title: json.headline.simpleText,
        }));

        return shorts;

    } catch (error) {
        return {};
    }
}

/**
 * 
 */
function parseChannelRender(response) {

    try {
        const channelUrl = response.shortBylineText.runs[0].navigationEndpoint.commandMetadata.webCommandMetadata.url;

        const channel = {
            id: channelUrl ? channelUrl?.replace('/', '') : '',
            type: "channel",
            title: response.title.simpleText,
            url: channelUrl ? channelUrl?.replace('/@', '/channel/') : '',
            avatar: response.thumbnail.thumbnails,
            description: response.descriptionSnippet.runs.map((x) => x.text).join(''),
            subscriber: response.videoCountText.simpleText,
        };

        return channel;

    } catch (error) {
        return error;
    }
}
