# Installation
> Update & Upgrade

```html
 apt-get update && apt-get upgrade -y && apt dist-upgrade -y && update-grub && reboot
 ```
> Run

```html
 apt install nodejs npm -y && curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh && curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash && source ~/.bashrc && nvm install v22.5.1 && apt install docker.io -y && apt install git && git clone https://github.com/hendramla/heeN-yt.git heeN-yt && cd heeN-yt && npm install && npm audit fix && docker build -t heeN-yt . && docker run -d --restart=always -p 9090:9090 --name heeN heeN-yt && systemctl enable docker
```
# Stop & Remove Docker
> Stop
```html
 docker stop heeN
 ```
> Remove
```html
 docker rm heeN
 ```
> Start New Docker
```html
 docker run -d --restart=always -p 9090:9090 --name heeN heeN-yt
 ```
# Youtube Search API

This is fork of Youtube Search API.

You can test it via opening http://localhost:9090

api routes are
/ = Home Page

/autocomplete = Search suggestion for input keyword

/channel/:id = Get Channel by id

/playlist/:id = Playlist by id

/search = Search results page

/watch/:id = Video Details page with comments and player embed, media files

/watch/:id/comments = Load more comments with replies

/watch/:id/suggestions = Load more Suggestions

/trending = Trending List Page 

## Installation

```bash
npm install && npm run dev
```
it will start express server on port 9090 so access it http://localhost:9090

## Demo
you can check working example on netlify by follow this link

https://cheetube.netlify.app/

It use ReactJS , ViteJS, Vite-Express, Express, TailwindCSS, React-icons

## Api Access

https://cheetube.netlify.app/api/

## Usage (import)

```node
const youtubesearchapi = require("youtube-search-api");
```

## GetListByKeywords (Promise)

```node
youtubesearchapi.GetListByKeyword("<keywords>",[playlist boolean],[limit number],[options JSONArray])
```

GetListByKeywords Result

```node
{items:[],nextPage:{nextPageToken:"xxxxxxxx",nextPageContext:{}}}
```

"items" is the array from youtube, "nextPage" needs to pass when going to the next page. If playlist arg is true, will return `type:'playlist'` but the `videos:[]` property will not return the whole videos in the list, need to call `GetPlaylistData` to get real playlist's videos. Item with Video type will return `isLive=[true/false]` to identify live video or not.

Options added, this version only support return result type, e.g. `[{type:'video'}]`.

### Parameters

| Parameter | Type       | Value                                   |
| --------- | ---------- | --------------------------------------- |
| keywords  | String     | up to you                               |
| playlist  | boolean    | true/false                              |
| limit     | number     | integer                                 |
| options   | JSON Array | [{type:"video/channel/playlist/movie"}] |

## NextPage (Promise)

```node
youtubesearchapi.nextPage(<nextPage from GetListByKeywords result>,[playlist boolean],[limit number])
```

NextPage Result

```node
{items:[],nextPage:{nextPageToken:"xxxxxxxx",nextPageContext:{}}}
```

Item with Video type will return `isLive=[true/false]` to identify live video or not.

## Playlist with ID (Promise)

```node
youtubesearchapi.GetPlaylistData(<Playlist Id>,[limit number])
```

Playlist Result

```node
{items:[],metadata:{}}
```

## Get Suggest Data (Promise)

```node
youtubesearchapi.GetSuggestData([limit number])
```

Suggest Data Result

```node
{
  items: [];
}
```

Item with Video type will return `isLive=[true/false]` to identify live video or not.

## Get Channel by channel Id (Promise)

```node
youtubesearchapi.GetChannelById(<channel ID>)
```

Channel Data Results

```node
[[{ title: "[title]", banner: [array], description: string, content: [Object] }]];
```

Will return tabs in array format.

## Get Video Details with suggestion

GetVideoDetails

```node
youtubesearchapi.GetVideoDetails(<video ID>)

```

Get Video Details Results

```node
{
 id: string
  title: string
  views: string
  likes: string
  publishedAt: string
  description: string
  channel: {
    id: string
    title: string
    url: string
    subscriber: string
    avatar: [{
      url: string
      width: number
      height: number
    }]
  },
  player: {
    id: string
    title: string
    thumbnails: [{
      url: string
      width: number
      height: number
    }]
    shortDescription: string
    length: string
    keywords: string[]
    category: string
    publishDate: string
    embed: {
      iframeUrl: string
      width: number
      height: number
    },
    media: [{
      url: string
      hls: any
      fileType: string
      type: string
      label: string
      width: number
      height: number
    }],
    formats: [{
      itag: number
      mimeType: string
      bitrate: number
      width: number
      height: number
      lastModified: string
      quality: string
      xtags: string
      fps: number
      qualityLabel: string
      projectionType: string
      audioQuality: string
      approxDurationMs: string
      audioSampleRate: string
      audioChannels: number
      signatureCipher: string
    }]
    adaptiveFormats: [{
      itag: number
      mimeType: string
      bitrate: number
      width?: number
      height?: number
      initRange: {
        start: string
        end: string
      }
      indexRange: {
        start: string
        end: string
      }
      lastModified: string
      contentLength: string
      quality: string
      fps?: number
      qualityLabel?: string
      projectionType: string
      averageBitrate: number
      colorInfo?: {
        primaries: string
        transferCharacteristics: string
        matrixCoefficients: string
      }
      approxDurationMs: string
      signatureCipher: string
      highReplication?: boolean
      audioQuality?: string
      audioSampleRate?: string
      audioChannels?: number
      loudnessDb?: number
    }]
  },
  suggestion: [{
      id: string
      type: string
      thumbnails: [{
        url: string
        width: number
        height: number
      }]
      title: string
      channel: {
        id: string
        title: string
        url: string
        subscriber: string
        avatar: [{
          url: string
          width: number
          height: number
        }]
      },
      length: string
      views: string
      publishedAt: string
      badges: string[]
      isLive: boolean
  }],
  suggestionContext: {
    nextPageToken: string
    nextPageContext: {
      context: Context
      continuation: string
    },
  },
  isLive: boolean,
  comments: [{
    text: string
    items: [{
      channel: Channel3
      isOwner: boolean
      content: string
      publishedAt: string
      likes?: string
      replyCount?: number
      repliesToken?: string
      replies?: [{
        channel: {
          id: string
          title: string
          url: string
          avatar: [{
            url: string
            width: number
            height: number
          }]
          verified: boolean
          artist: boolean
        },
        isOwner: boolean
        content: string
        publishedAt: string
        likes?: string
      }]
    }]
    nextPage: {...}
  }],
  commentContext: {...},
}
```

Will return video details in Json format.

## Get Short Video List (Beta)

Only return short video from suggestion.

GetShortVideo

```node
youtubesearchapi.GetShortVideo()

```

Get Short Video List Results

```node
[
  {
    id: "",
    type: "reel",
    thumbnail: {
      url: '',
      width: 405, //only return 405
      height: 720 //only return 720
    },
    title: '',
    inlinePlaybackEndpoint: {} //may not return all the time
  }
]
```

Will return Short Video list in Json Array format.

### Limitation:
1. Only return short video from suggestion.
2. inlinePlaybackEndpoint facing async issue.
3. Only return first page of short video.
