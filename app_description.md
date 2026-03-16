Name of the App J&Bs RPG

A story driven ttrpg adventure where the 


Objective of the game:
- get to the final scene and fight the boss. only a roll of a 20 or higher will win, any other roll will lose.

Rules of the game:
- The players will play through a number of scenes, each player being the decision maker for that scene
  - There could be more or fewer scenes than players
- each scene will have a bit of story and a decision to be made
- the players discuss the story and the decision maker for that scene determines which one action, of 3 choices, to take
- Each of the actions results in one of the following: a failure, gain an item, or gain a level
  - failure results in a loss of a health point (the players have 3 by default)
  - players start a level 1 and no items
  - each item gained along the way will add +1 to their die roll at the end of the game
  - each level they advance will give them an additional roll attempt at the end of the game
- all players play one character

Other gameplay notes:
- before the game play starts, the players help build out the character through a mad libs like game. going around the table, each player picks a word that would fill in the description for the character. helping to build things like flaws, quirks, and other characteristics by picking certain types of words without them knowing what they're for and how they will be used to influence the character. things like:
	- name a personality quirk
	- name a malidy
	- give a first/last/middle name
	- other nouns like name an occupation, physical trait, etc.

Things I'd like the app to do:
- two modes:
	- help the story teller build out the story
		- help manage scenes and timeline
		- have an editor to write out the scenes and each of the narratives for choices/consequences
		- well laid out / form for each section of the story
	- help the story teller to run the story
		- facilitate the character building mad libs portion
		- display each scene to be read in a scene by scene presentation mode
		- offer each choice narrative as a selection
		- keep a running tally of lives, items, and levels based on the choice selection
		- when the choice is made, advance to the next scene with the previous scene and outcome showing as a reminder in smaller font
		- 

- Implementation thoughts
	- It should be a relatively simple application, no need for bloat or things like a database
	- story could be saved off in a json (or other format that makes sense) flat file with the tree like structure. CRUD happens and gets persisted to the flat file
	- current play through state for things like lives, item and level counts could be stored somewhere ephemerally, but shouldn't disappear on reload unless the user has chosen to start over
	- there should be settings how many lives to start with
	- it would be nice to have a few templates for the mad libs character creation portion, but should also offer support to construct a template with placeholders to be filled and then run the character creation portion asking for each of those fields. The editor should have a means to input the space holder, noting the time of word(s) that should go in that space, and then know that it should ask for those types of words when running the mad libs character creation part.
	- settings for the story to retain as metadata along with the scene texts could include number of lives as well as any other metadata that would be valuable
	- this could be a simply python application with fastapi and serving static html pages with minimal styling
	- light and dark mode support for both writing mode as well as the presenting mode
	- presenting mode should be pretty distraction free, kind of like the presentation mode of a power point slideshow
	- a back button should be available to undo a selection and go to the previous scene. this should be available for the entire story. meaning, one could go back to the beginning if they wanted to. there should also be a button to start over
	- it would be nice to have a story progress indication
	- when reaching the end it should give a summary of the life, items they've obtained, and level states

Example of potential flat file structure:

```
{
  "scenes": [
    {
      "id": "scene_1",
      "base_text": "You enter the old observatory as thunder rolls outside.",
      "conditional_text": [],
      "choices": [
        { "kind": "damage", "text": "Climb the broken stairs", "amount": 1 },
        { "kind": "item", "text": "Search the supply cabinet", "amount": 1 },
        { "kind": "level", "text": "Study the star charts", "amount": 1 }
      ]
    },
    {
      "id": "scene_2",
      "base_text": "The upper chamber smells of ozone and dust.",
      "conditional_text": [
        { "condition": "hp <= 3", "text": "Your injuries make every step ache." },
        { "condition": "item_count >= 1", "text": "Your earlier find gives you some confidence." },
        { "condition": "level >= 2", "text": "You recognize the pattern in the machinery immediately." }
      ],
      "choices": [
        { "kind": "damage", "text": "Force open the jammed dome", "amount": 1 },
        { "kind": "item", "text": "Loot the instrument case", "amount": 1 },
        { "kind": "level", "text": "Decode the control panel", "amount": 1 }
      ]
    }
  ]
}
```

example potential pydantic data models if valuable:

```
class GameState(BaseModel):
    hp: int = 5
    level: int = 1
    item_count: int = 0

class Item(BaseModel):
	name: str
	description: str

class ChoiceKind(str, Enum):
    DAMAGE = "damage"
    ITEM: Item
    LEVEL = "level"


class Choice(BaseModel):
    kind: ChoiceKind
    text: str
    amount: int = 1


class ConditionalText(BaseModel):
    condition: str
    text: str


class Scene(BaseModel):
    id: str
    base_text: str
    choices: list[Choice]
    conditional_text: list[ConditionalText] = []
 ```
