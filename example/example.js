import * as youtube from "../api/parser.js"

youtube.GetListByKeyword("JSDeveloper", true, 2, [{ type: "video" }])
  .then((res) => {
    console.log("Page1");
    console.log(res);

    youtube
      .nextPage(res.nextPage, true, 2)
      .then((result) => {
        console.log("Page2");
        console.log(result);
        youtube
          .nextPage(result.nextPage, true, 2)
          .then((result1) => {
            console.log("Page3");
            console.log(result1);
          })
          .catch((err) => {
            console.log(err);
          });
      })
      .catch((err) => {
        console.log(err);
      });
  })
  .catch((err) => {
    console.log(err);
  });

youtube.GetPlaylistData("RDCLAK5uy_lGZNsVQescoTzcvJkcEhSjpyn_98D4lq0")
  .then((res) => {
    console.log("Playlist results");
    console.log(res);
  })
  .catch((err) => {
    console.log(err);
  });

youtube.GetSuggestData()
  .then((res) => {
    console.log(res);
  })
  .catch((err) => {
    console.log(err);
  });

youtube.GetChannelById(`@RailCowGirl`)
  .then((res) => {
    console.log(res);
  })
  .catch((err) => {
    console.log(err);
  });

youtube.GetVideoDetails("cC2UqBuFAEY")
  .then((result) => {
    console.log(result);
  })
  .catch((err) => {
    console.error(err);
  });

youtube.GetShortVideo()
  .then((shortVideoResult) => {
    console.log(shortVideoResult);
  })
  .catch((err) => {
    console.log(err);
  });
