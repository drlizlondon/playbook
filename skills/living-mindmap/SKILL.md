---
name: living-mindmap
description: Paste this into any ongoing AI conversation and it turns the thread into ONE living picture you think from. It reads back over everything you have already discussed — projects, tasks, decisions, things you are waiting on — and builds a hub-and-spoke map with you in the centre and every piece of work a branch, colour-coded by whether it needs you, is waiting on someone, is in progress, done, or parked. Branches that hold more open up when you tap them; every node carries a button to keep thinking it through, right there in the map. Then it stays live: as the conversation carries on it updates the map instead of starting over, and you can drop the prompt into any thread to spin up a map of that one. Use when a long chat has sprawled and you have lost the thread of what you are actually working on, or someone says "map everything we've covered", "turn this conversation into a mindmap", "build me a living map of my work", "keep a live map of this thread".
---

# The Living Mindmap

A long working conversation sprawls. Twenty messages in, you have made decisions, opened loops, and parked things across half a dozen topics — and the thread itself has become the only record of it: unsearchable, unscannable, impossible to hold in your head. You scroll up to remember what you were waiting on and lose your place.

The Living Mindmap turns that thread into a picture. You paste **one prompt, at any point in any conversation**, and it reads back over everything you have already discussed and draws it: **you in the centre**, every piece of work a branch, **colour-coded by what needs you now**. No brain-dump, no re-listing — it works from the conversation you are already in. Then it stays live: as the chat carries on, it updates the map rather than starting over.

## The design: four ideas that keep it alive

The map stays useful instead of going stale because of four choices, and they are worth keeping if you adapt it.

| Idea | What it means | Why it matters |
|---|---|---|
| **It reads the thread, not a form** | It builds from what you have already said in the conversation, and updates itself as the conversation continues. | The expensive part of every planning tool is data entry. Here there is none — the work is already in the thread, so the map is free to make and free to keep current. |
| **The map is data, not a drawing** | The picture is generated from one list of nodes (title, status, detail, parent). | "Update the map" means editing that data and regenerating — cheap and safe, so you actually do it. |
| **Status is colour** | Every branch is one of a few states: *needs me, waiting on someone, in progress, done, parked,* with a small key in the corner. | You read priority before you read words. The map answers "what needs me?" from across the room, without reading a single label. |
| **Every node is a place you think from** | Clicking a node opens its detail, and its detail carries a button to continue that thread with the AI, inline. | The picture stops being read-only and becomes a workspace — you move from *seeing* the work to *doing* the next bit without switching tools. |

The connecting principle is the same one the rest of this playbook runs on: the frequent action has to be cheap. If keeping your map current is expensive, you stop, and it rots. Here the frequent action is just *carrying on the conversation* — the map rides along.

## The build: one prompt, pasted into a live thread

This is the whole mechanism. Paste it at any point in a conversation with any capable AI that can produce an interactive artifact or HTML page. It was built with Claude Artifacts, where the "keep thinking" button uses the page's ability to call the model; on a host without that, the map still works as a clickable picture and the button is simply omitted. A standalone copy lives in [`reference/prompt.md`](reference/prompt.md).

> Build me a living mindmap of my work as an interactive artifact, from this conversation.
>
> First, look back over everything we have covered in this thread so far and pull out what I am working on: projects, tasks, decisions, things I am waiting on. Build the map from that. Do not make me re-list what I have already told you. (If we are right at the start and there is nothing to review yet, ask me for a quick brain-dump instead.)
>
> Then turn it into a hub-and-spoke map:
> - Me in the centre.
> - Each main thing as a branch off the centre.
> - Colour every branch by its status: needs me, waiting on someone, in progress, done, parked. Show a small key.
> - If a branch has sub-parts, draw a ring around it. Clicking it drills into its sub-branches, with a breadcrumb to get back out.
> - Click any node to open its detail: what it is, what is next, who or what it is waiting on.
> - Dark background, uncluttered, readable on a phone.
> - On each node's detail, add a button that lets me keep thinking it through with you, right there in the map.
>
> Keep it live: as this conversation carries on, update the map when something changes or something new comes up, rather than starting over. I can also paste this again in any thread to spin up a fresh map of that one.

## Driving it

- **Paste it whenever the thread has sprawled.** You do not need to prepare anything — the later in the conversation you drop it, the more it has to work from.
- **Keep it open.** The point is a durable surface, not a one-off diagram. Publish or save the artifact and bookmark it.
- **Let the conversation feed it.** As you keep working in the thread, say "update the map" (or just keep going — it rides along). "Mark the launch done." "The supplier replied, move that to in-progress." Because the map is data, each is one small change, never a redraw.
- **Let branches nest.** When a branch grows its own moving parts, say so — it gets a ring and becomes a thing you drill into, so the top level stays calm and scannable.
- **Think from a node.** When you open a node and want to work the problem, use its continue button instead of starting a fresh chat; the context is already the thing you are looking at.
- **One map per thread.** Each conversation gets its own map. Drop the prompt into a different thread and you get a fresh map of that one.

## Honest limits

- It holds the shape of your work, not a calendar or deadlines. If you need dates and reminders, this sits beside a planner, it does not replace one.
- It is only as good as the thread it reads. A map built mid-conversation reflects what has been said so far; things you have not mentioned are not in it, and it goes stale exactly as fast as you stop updating it.
- The "keep thinking" button needs a host where the page can call the model (Claude Artifacts does; a plain static-HTML host does not). Everywhere else it degrades to a clean, clickable map — nothing breaks, you just lose the inline button.

## Files

| Path | What it is |
|---|---|
| `reference/prompt.md` | The single build prompt as a standalone file, to paste into a thread or point an agent at. |

No install, no dependencies, no script. The prompt is the tool.
