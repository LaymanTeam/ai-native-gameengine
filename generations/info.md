The proposed structure of files created by AI:
game name -> title of head folder
/research
/references/
- images of games in there for basing
/reports/
- structure rules etc.
assets/ -> there needs to be a review loop
json-map assets to objects.
- sprites/ -> gemini image create or node base tool for pixel image create
- background/ -> gemini image create OR node based tool to create pixel images via code and statement
- images/-> gemini image create
- sfx/ -> get from opensource sfx library website use gemini to trawl provide a langchain tool to fetch
- music/ -> get from opensource music library using gemini to trawl fetch
- scenes/-> gemini image create or open source artwork library
- fonts/ -> download from google cdn provide route
- text/ #JSONIC trees
systems/ -> gemini smarter model doing pure code, inject research folder
/rules/ #global logic
/animations/
/entities/ #individual asset logic
/ai/ #if anything about the entities or ui logic
/calls/
/physics/
/controller/
ui/ -> gemini smart
/components/
/methods/
saves/ # state
- storage-schema
-  RxDb file goes here
config/
json files for each asset tied to the variable used in code
json for styling
render/
tests/
tests.ts self-authored tests of the game system
main.ts
---
