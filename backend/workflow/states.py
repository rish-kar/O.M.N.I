"""State machine for the job application workflow."""
from __future__ import annotations
from enum import Enum


class State(str, Enum):
    IDLE = "IDLE"
    PREPARE = "PREPARE"
    SEARCH_JOBS = "SEARCH_JOBS"
    EXTRACT_JD = "EXTRACT_JD"
    SEND_TO_CHATGPT_TAB = "SEND_TO_CHATGPT_TAB"
    UPDATE_TRACKER = "UPDATE_TRACKER"
    TAILOR_RESUME = "TAILOR_RESUME"
    APPLY_ON_SITE = "APPLY_ON_SITE"
    FINAL_REVIEW = "FINAL_REVIEW"
    SUBMIT_OR_SAVE = "SUBMIT_OR_SAVE"
    MEMORY_UPDATE = "MEMORY_UPDATE"
    DONE = "DONE"
    ERROR_RECOVERY = "ERROR_RECOVERY"
    PAUSED = "PAUSED"


TRANSITIONS: dict[State, set[State]] = {
    State.IDLE: {State.PREPARE},
    State.PREPARE: {State.SEARCH_JOBS, State.ERROR_RECOVERY},
    State.SEARCH_JOBS: {State.EXTRACT_JD, State.ERROR_RECOVERY, State.DONE},
    State.EXTRACT_JD: {State.SEND_TO_CHATGPT_TAB, State.ERROR_RECOVERY},
    State.SEND_TO_CHATGPT_TAB: {State.UPDATE_TRACKER, State.ERROR_RECOVERY},
    State.UPDATE_TRACKER: {State.TAILOR_RESUME, State.ERROR_RECOVERY},
    State.TAILOR_RESUME: {State.APPLY_ON_SITE, State.ERROR_RECOVERY, State.MEMORY_UPDATE},
    State.APPLY_ON_SITE: {State.FINAL_REVIEW, State.ERROR_RECOVERY},
    State.FINAL_REVIEW: {State.SUBMIT_OR_SAVE, State.ERROR_RECOVERY},
    State.SUBMIT_OR_SAVE: {State.MEMORY_UPDATE, State.ERROR_RECOVERY},
    State.MEMORY_UPDATE: {State.SEARCH_JOBS, State.DONE},
    State.DONE: {State.IDLE},
    State.ERROR_RECOVERY: {State.IDLE, State.PREPARE},
    State.PAUSED: set(State),  # can resume into anything
}


def can_transition(src: State, dst: State) -> bool:
    return dst in TRANSITIONS.get(src, set())
