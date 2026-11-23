"""Request bodies for the desk and Spotify APIs."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

Genre = Literal[
    "jazz", "electronic", "rnb", "rock", "folk", "ambient", "hiphop", "unsorted"
]
Verdict = Literal["heavy", "keep", "pulled"]


class AlbumRef(BaseModel):
    album_id: UUID


class SkipInput(BaseModel):
    # None brings back every album skipped this week.
    album_id: UUID | None = None


class MoveInput(BaseModel):
    album_id: UUID
    to: int = Field(ge=0)


class EntryInput(BaseModel):
    verdict: Verdict | None = None
    note: str | None = Field(default=None, max_length=2000)
    clear_verdict: bool = False


class AlbumInput(BaseModel):
    note: str | None = Field(default=None, max_length=4000)
    genre: Genre | None = None


class PolicyInput(BaseModel):
    min_hours: int = Field(ge=1, le=12)
    max_hours: int = Field(ge=2, le=16)
    min_currents: int = Field(ge=0, le=10)
    min_first_plays: int = Field(ge=0, le=10)
    min_gold: int = Field(ge=0, le=10)
    max_genre_share: float = Field(ge=0.1, le=1)
    no_repeat_artist: bool
    gold_cooldown_weeks: int = Field(ge=1, le=52)
    current_window_days: int = Field(ge=7, le=90)


class CredentialsInput(BaseModel):
    client_id: str = Field(pattern=r"^[0-9a-fA-F]{32}$")
    client_secret: str = Field(pattern=r"^[0-9a-fA-F]{32}$")


class SearchInput(BaseModel):
    q: str = Field(min_length=1, max_length=200)


class ImportInput(BaseModel):
    ref: str = Field(pattern=r"^spotify:album:[0-9A-Za-z]{22}$")
    add: bool = True
