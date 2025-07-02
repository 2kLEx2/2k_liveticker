import aiohttp
from twitchio.ext import commands, routines
import asyncio

API_URL = 'http://localhost:3000/api/display/live'  # Adjust if your API is remote

class Bot(commands.Bot):
    def __init__(self):
        super().__init__(
            token='oauth:ku4mnwqr5zfkroxprq0r1b6nmkyjzu',
            prefix='!',
            initial_channels=['2klexxx']
        )
        self.last_match_id = None
        self.last_map_number = None
        self.last_score = None
        self.latched_win = None
        self.last_map_count1 = None
        self.last_map_count2 = None

    async def event_ready(self):
        print(f"Logged in as | {self.nick}")
        self.post_score.start()

    @routines.routine(seconds=10)
    async def post_score(self):
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(API_URL) as resp:
                    if resp.status != 200:
                        return
                    data = await resp.json()

            # Detect match or map change (reset latch)
            match_id = data.get('matchId')
            map_number = data.get('mapNumber')
            if self.last_match_id != match_id or self.last_map_number != map_number:
                self.latched_win = None
                self.last_score = None
                self.last_map_count1 = None
                self.last_map_count2 = None
                self.last_match_id = match_id
                self.last_map_number = map_number

            # Compose score message (mimic display)
            score = f"{data['teamName1']} {data['scoreLeft']} : {data['scoreRight']} {data['teamName2']} (Map {data['mapNumber']}, {data['mapInfo']})"
            map_count1 = data.get('mapCount1')
            map_count2 = data.get('mapCount2')

            # Announce score if changed (including map count)
            score_state = (score, map_count1, map_count2)
            if self.last_score != score_state:
                # Only send score if not 0:0
                try:
                    left = int(data['scoreLeft'])
                    right = int(data['scoreRight'])
                except (ValueError, TypeError, KeyError):
                    left = right = None
                if left != 0 or right != 0:
                    map_number = data.get('mapNumber') or 1
                    msg = f"| ({map_count1}) {data['teamName1']} {data['scoreLeft']}:{data['scoreRight']} {data['teamName2']} ({map_count2}) | map{map_number} | bo{str(data.get('matchFormat', '').replace('BO', '').lower() or 'x')}"
                    await self.connected_channels[0].send(msg)
                self.last_score = score_state

            # Announce win if detected (robust, with debug logging)
            win_team = data.get('winTeam')
            win_type = data.get('winType')
            win_line = data.get('winLine')
            debug_info = f"[WIN DEBUG] winTeam={win_team} winType={win_type} winLine={win_line}"
            print(debug_info)

            # Accept win if winTeam and winType are present and not empty
            if win_team and win_type and str(win_team).strip() and str(win_type).strip():
                win_msg = f"🏆 {win_team} wins {win_type}! {win_line or ''}"
                if self.latched_win != win_msg:
                    print(f"[WIN DEBUG] Announcing win: {win_msg}")
                    await self.connected_channels[0].send(win_msg)
                    self.latched_win = win_msg
            else:
                self.latched_win = None
        except Exception as e:
            print(f"Error fetching or posting score: {e}")

if __name__ == "__main__":
    bot = Bot()
    bot.run()
