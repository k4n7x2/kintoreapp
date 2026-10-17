/* Episode 01 temporary adaptation of game-script.md v1.1; no read/progress persistence. */
"use strict";
/* global monogatari, Monogatari */
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
monogatari.settings({
  Name: "kintoreapp-episode-01-trial", Version: "0.1.0", Label: "Start",
  ShowMainScreen: false, LanguageSelectionScreen: false, MultiLanguage: false,
  Preload: false, AutoSave: 0, Slots: 0, ServiceWorkers: false,
  Screenshots: false, AllowRollback: false, Skip: 0,
  Orientation: "any", ForceAspectRatio: "None",
  TypeAnimation: !reduceMotion, InstantText: true,
  Storage: { Adapter: "SessionStorage", Store: "MonogatariEpisode01Temporary", Endpoint: "" },
  AssetsPath: {
    root: "/assets", characters: "shiori/gim/v1", scenes: "backgrounds",
    icons: "icons", images: "images", music: "music", sounds: "sounds",
    ui: "ui", videos: "videos", voices: "voices", gallery: "gallery"
  }
});
monogatari.preferences({ Language: "English", TextSpeed: 14 });
monogatari.assets("scenes", { gym_day: "gym-day.webp" });
// Keep one sprite identity on stage. Use separate *speakers* so the portrait never
// has to be removed/recreated just to change the name from ？？？ to 朝倉 栞.
monogatari.characters({
  m: { name: "？？？", color: "#e5cffb" },
  s: {
    name: "朝倉 栞", color: "#e5cffb",
    sprites: {
      normal: "shiori-home-training-bust-v1.webp",
      thinking: "shiori-gim-story-thinking-r1.webp",
      surprised: "shiori-gim-story-surprised-r1.webp",
      smile: "shiori-gim-story-smile-r1.webp",
      playful: "shiori-gim-story-playful-r1.webp"
    }
  }
});
const say = (speaker, lines) => lines.map((line) => speaker + " " + line);
function pose(mode) {
  return { Function: {
    Apply() {
      const img = document.querySelector('game-screen img[data-character="s"]');
      if (img) img.dataset.pose = mode;
      return true;
    },
    Revert() {
      const img = document.querySelector('game-screen img[data-character="s"]');
      if (img) delete img.dataset.pose;
    }
  } };
}
function dialogueVisible(visible) {
  return { Function: {
    Apply() { document.body.classList.toggle("episode-dialogue-hidden", !visible); return true; },
    Revert() { document.body.classList.toggle("episode-dialogue-hidden", visible); }
  } };
}
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || window.parent === window) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  window.parent.postMessage({ type: "kintore-monogatari-close-request-v1" }, window.location.origin);
}, true);
function finishEpisode() {
  if (window.parent !== window) {
    window.parent.postMessage({ type: "kintore-monogatari-finished-v1" }, window.location.origin);
  }
  return true;
}
monogatari.script({
  Start: [
    // CUT 00: silent glimpses. No imaginary keychain image or narrator.
    "show scene gym_day with fadeIn",
    "show character s normal at left with fadeIn",
    "wait 520",
    "hide character s with fadeOut",
    "show scene #15111e with fadeIn",
    "wait 220",
    "show scene gym_day with fadeIn",
    "show character s normal at right with fadeIn",
    "wait 650",
    "show character s thinking at center with move transition 500ms",
    "wait 650",
    "hide character s with fadeOut",
    "show scene #15111e with fadeIn",
    "wait 260",
    // CUT 01: before identification she always speaks politely.
    "show scene gym_day with fadeIn",
    "show character s normal at center with fadeIn",
    "wait 320",
    dialogueVisible(true),
    ...say("m", [
      "……あの",
    ]),
    "wait 250",
    ...say("m", [
      "すみません。今、ちょっといいですか？",
    ]),
    "wait 440",
    ...say("m", [
      "ありがとうございます。少し気になったことがあって……",
      "そのバッグについてるキーホルダー……",
      "あのゲームのキャラクターですよね？"
    ]),
    "wait 350",
    "show character s smile at center",
    ...say("m", [
      "あ、やっぱり！",
      "懐かしいな。私も昔、よく遊んでたんです",
      "それ、限定版ですよね？ なかなか見かけなくて"
    ]),
    "show character s thinking at center",
    pose("tilt"),
    ...say("m", ["あの、それって昔から持ってるんですか？"]),
    "wait 450",
    pose(""),
    ...say("m", [
      "そうなんですね……",
      "あの、変なこと聞いてもいいですか？",
      "それって、誰かにもらったものだったりしますか？"
    ]),
    "wait 600",
    "show character s surprised at center",
    ...say("m", [
      "……えっ",
      "あ、ごめんなさい。ちょっとびっくりしちゃって……"
    ]),
    // CUT 02: cautious recognition, still formal.
    pose("far"),
    "wait 450",
    "show character s thinking at center",
    ...say("m", [
      "もしかしたら、すごい勘違いかもしれないんですけど……",
      "私たち、昔どこかで会ったこと、ありませんか？"
    ]),
    "wait 600",
    pose(""),
    ...say("m", [
      "実は、前からちょっと見覚えがある気がして……",
      "でも、まさかこんなところでって思ってたんです",
      "それで、前にそのキーホルダーを見かけて……",
      "小学生の頃、一緒にゲームしてた子がいたんです",
      "その子も、このキャラクターがすごく好きで"
    ]),
    "show character s thinking at center",
    "wait 420",
    { Choice: {
      Dialog: "m ……あの、もしかして。私のこと、覚えてませんか？",
      shiori: { Text: "……栞？", Do: "jump EpisodeNameShiori" },
      asakura: { Text: "……朝倉？", Do: "jump EpisodeNameAsakura" }
    } }
  ],
  EpisodeNameShiori: [
    "show character s surprised at center",
    ...say("m", ["……！", "そう！"]),
    "jump EpisodeReunited"
  ],
  EpisodeNameAsakura: [
    "show character s surprised at center",
    ...say("m", ["……！ うん！", "そう、朝倉栞！"]),
    "jump EpisodeReunited"
  ],
  EpisodeReunited: [
    // From this point the speaker name is known and her tone is familiar.
    "show character s smile at center",
    pose("near"),
    ...say("s", [
      "久しぶり！ 元気してた？",
      "よかったー！ 人違いだったらどうしようかと思った",
      "だって、こんなところで会うなんて思わないでしょ？"
    ]),
    "wait 400",
    pose("tilt"),
    ...say("s", [
      "……ん？ どうしたの？",
      "あ、もしかして、全然気づいてなかった？"
    ]),
    "wait 250",
    "show character s normal at center",
    pose(""),
    ...say("s", [
      "そっか。まあ、そうだよね",
      "私もあのキーホルダーがなかったら、声かけられなかったと思うし"
    ]),
    // CUT 03: unchanged habit, home nearby, training motivation.
    "show character s normal at center",
    ...say("s", [
      "それにしても、そのキーホルダー……",
      "私があげたやつだよね？"
    ]),
    "wait 450",
    "show character s smile at center",
    ...say("s", [
      "うん。やっぱり",
      "それ、まだ使ってくれてたんだね",
      "当時もそのキャラばっかり使ってたよね",
      "今も好きなの？"
    ]),
    "wait 450",
    pose("near"),
    ...say("s", [
      "そっか。変わらないね",
      "……なんか、ちょっと嬉しいな",
      "でも、ずいぶん長持ちしてるね",
      "ちょっと傷ついてるけど"
    ]),
    "wait 300",
    pose(""),
    "show character s normal at center",
    ...say("s", [
      "そういえば、引っ越してから全然会わなくなっちゃったよね",
      "あれからどうしてたの？"
    ]),
    "wait 650",
    ...say("s", [
      "へえ、そうなんだ",
      "……え、今この辺に住んでるの？"
    ]),
    "wait 450",
    "show character s smile at center",
    ...say("s", [
      "私も！ 最近、一人暮らしを始めたんだ",
      "ここ、家から歩いて5分くらいなの",
      "すごい偶然だね。まさかこんなところで会うなんて"
    ]),
    "show character s normal at center",
    ...say("s", [
      "あ、そうだ。私、まだトレーニングの途中だった",
      "危ない危ない。すっかり話し込んじゃった",
      "……でも、久しぶりに会えてよかった",
      "実は最近、ジムに来るのがなかなか続かなくて",
      "近いから大丈夫だと思ってたんだけどね"
    ]),
    "wait 200",
    pose("tilt"),
    ...say("s", [
      "意外と難しいんだよね、これが",
      "……あ、そうなんだ",
      "じゃあ、似たような感じなのかな",
      "まあ、今日は二人とも来られたってことで",
      "それでいいんじゃないかな"
    ]),
    pose(""),
    // CUT 04: goodbye, turn back, and choice.
    "show character s normal at right with move transition 650ms",
    ...say("s", [
      "さて、と。そろそろ戻らないとね",
      "このままだと、話して終わっちゃいそう",
      "じゃあ、またね"
    ]),
    "show character s normal at right with move transition 400ms",
    "wait 360",
    "show character s smile at center with move transition 600ms",
    ...say("s", ["あ、そうだ"]),
    { Choice: {
      Dialog: "s またここで会ったら、声かけてもいい？",
      okay: { Text: "もちろん", Do: "jump EpisodeAnswerOkay" },
      again: { Text: "またジムで会おう", Do: "jump EpisodeAnswerAgain" }
    } }
  ],
  EpisodeAnswerOkay: [
    ...say("s", ["よかった。じゃあ、また見かけたら声かけるね"]),
    "jump EpisodeGoodbye"
  ],
  EpisodeAnswerAgain: [
    ...say("s", ["うん。見かけたら声かけるね"]),
    "jump EpisodeGoodbye"
  ],
  EpisodeGoodbye: [
    "show character s playful at center",
    pose("tilt"),
    ...say("s", ["……今度は、そっちから気づいてくれてもいいんだよ？"]),
    "wait 380",
    pose(""),
    dialogueVisible(false),
    "hide character s with fadeOut",
    "show scene #15111e with fadeIn",
    "wait 300",
    finishEpisode,
    "end"
  ]
});
Monogatari.$_ready(() => {
  monogatari.init("#monogatari").catch((error) => {
    console.error("Episode 01 Monogatari init failed", error);
    document.getElementById("episode-failure")?.removeAttribute("hidden");
  });
});
