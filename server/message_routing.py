"""
Message Routing Module for Python Backend
Handles: Message IDs, Duplicate Suppression, TTL, Peer Relay Forwarding
"""

import json
import time
from typing import Dict, Any, List, Set, Optional
from datetime import datetime, timedelta
from collections import defaultdict


class MessageCache:
    """Maintains cache of seen message IDs to prevent duplicates"""
    
    def __init__(self, max_size: int = 5000):
        self.cache: Dict[str, float] = {}
        self.max_size = max_size
    
    def is_duplicate(self, message_id: str) -> bool:
        """Check if message ID was already processed"""
        return message_id in self.cache
    
    def add(self, message_id: str) -> None:
        """Add message ID to cache"""
        if len(self.cache) >= self.max_size:
            # Remove oldest entry
            oldest = min(self.cache, key=self.cache.get)
            del self.cache[oldest]
        
        self.cache[message_id] = time.time()
    
    def cleanup(self, ttl_seconds: int = 300) -> int:
        """Remove expired entries (older than TTL)"""
        now = time.time()
        expired = [msg_id for msg_id, timestamp in self.cache.items() 
                   if now - timestamp > ttl_seconds]
        
        for msg_id in expired:
            del self.cache[msg_id]
        
        return len(expired)


class MessageRouter:
    """Routes messages through the P2P network"""
    
    def __init__(self, server_name: str = "server", default_ttl: int = 300):
        self.server_name = server_name
        self.message_cache = MessageCache()
        self.default_ttl = default_ttl  # 5 minutes
        self.routing_table: Dict[str, List[str]] = defaultdict(list)
    
    def create_message(
        self,
        to_user: str,
        content: Any,
        from_user: str = None,
        options: Dict = None
    ) -> Dict:
        """Create a routable message with metadata"""
        options = options or {}
        
        import uuid
        import base64
        
        # Create message ID
        msg_id = f"msg_{int(time.time() * 1000)}_{base64.b64encode(uuid.uuid4().bytes[:6]).decode()}"
        
        return {
            "id": msg_id,
            "from": from_user or self.server_name,
            "to": to_user,
            "content": content,
            "timestamp": int(time.time()),
            "ttl": options.get("ttl", self.default_ttl),
            "path": [self.server_name],
            "encrypted": options.get("encrypted", False),
            "priority": options.get("priority", "normal"),
            "created_at": datetime.now().isoformat()
        }
    
    def validate_message(self, msg: Dict) -> tuple[bool, str]:
        """Validate message structure and content"""
        
        # Check required fields
        required = ["id", "from", "to", "timestamp", "ttl"]
        for field in required:
            if field not in msg:
                return False, f"Missing required field: {field}"
        
        # Check for duplicates
        if self.message_cache.is_duplicate(msg["id"]):
            return False, "Duplicate message"
        
        # Check TTL
        age = int(time.time()) - msg["timestamp"]
        if age > msg["ttl"]:
            return False, f"Message TTL expired (age: {age}s, ttl: {msg['ttl']}s)"
        
        # Check routing loops
        if "path" in msg and msg["path"]:
            if len(msg["path"]) != len(set(msg["path"])):
                return False, "Routing loop detected"
            
            if len(msg["path"]) > 10:
                return False, "Max hops (10) exceeded"
        
        return True, "Valid"
    
    def process_message(self, msg: Dict) -> Dict:
        """Process incoming message"""
        valid, reason = self.validate_message(msg)
        
        if not valid:
            return {
                "processed": False,
                "reason": reason,
                "message_id": msg.get("id")
            }
        
        # Mark as processed
        self.message_cache.add(msg["id"])
        
        # Check if we're the recipient
        is_for_us = msg["to"] == self.server_name
        
        return {
            "processed": True,
            "for_us": is_for_us,
            "message": msg,
            "message_id": msg["id"],
            "age_seconds": int(time.time()) - msg["timestamp"],
            "path": msg.get("path", [])
        }
    
    def add_to_path(self, msg: Dict, node_name: str) -> Dict:
        """Add current node to message path"""
        if "path" not in msg:
            msg["path"] = []
        
        if node_name not in msg["path"]:
            msg["path"].append(node_name)
        
        return msg
    
    def get_message_age(self, msg: Dict) -> int:
        """Get message age in seconds"""
        return int(time.time()) - msg["timestamp"]
    
    def get_remaining_ttl(self, msg: Dict) -> int:
        """Get remaining TTL in seconds"""
        age = self.get_message_age(msg)
        return max(0, msg["ttl"] - age)
    
    def format_message(self, msg: Dict) -> Dict:
        """Format message for logging"""
        return {
            "id": msg["id"],
            "from": msg["from"],
            "to": msg["to"],
            "path": " -> ".join(msg.get("path", [])),
            "age_seconds": self.get_message_age(msg),
            "ttl_remaining": self.get_remaining_ttl(msg),
            "hops": len(msg.get("path", []))
        }


class RelayForwarder:
    """Handles forwarding messages through the network"""
    
    def __init__(self, message_router: MessageRouter):
        self.message_router = message_router
        self.relay_cache: Dict[str, float] = {}
        self.user_locations: Dict[str, str] = {}  # username -> connection_id
    

    def find_route(
        self,
        destination: str,
        online_users: List[str],
        connected_peers: Dict[str, Any]
    ) -> Dict:
        """Find optimal route to deliver message"""
        
        # Direct route available?
        if destination in online_users:
            return {"route": "direct", "target": destination}
        
        # Try relay through known peers
        relay_candidates = [u for u in online_users if u in connected_peers]
        if relay_candidates:
            return {"route": "relay", "targets": relay_candidates}
        
        # Fall back to holding/queuing
        return {"route": "queue", "target": None}
    
    def relay_to_peers(
        self,
        msg: Dict,
        peers: Dict[str, Any],
        exclude: Set[str] = None
    ) -> Dict:
        """Relay message to connected peers"""
        exclude = exclude or set()
        relay_id = f"{msg['id']}_relay"
        
        # Don't relay same message twice
        if relay_id in self.relay_cache:
            return {"success": False, "reason": "Already relayed"}
        
        self.relay_cache[relay_id] = time.time()
        
        # Add server to path
        self.message_router.add_to_path(msg, "server")
        
        relayed = []
        for peer_name, peer_info in peers.items():
            if peer_name not in exclude and peer_info.get("online"):
                relayed.append({
                    "peer": peer_name,
                    "message_id": msg["id"],
                    "forwarded_at": datetime.now().isoformat()
                })
        
        return {"success": True, "relayed_to": relayed}
    
    def cleanup(self, max_age_seconds: int = 600):
        """Clean old relay entries"""
        now = time.time()
        expired = [
            relay_id for relay_id, timestamp in self.relay_cache.items()
            if now - timestamp > max_age_seconds
        ]
        
        for relay_id in expired:
            del self.relay_cache[relay_id]
        
        return len(expired)


class MessageQueue:
    """Queue for messages destined to offline users"""
    
    def __init__(self, max_per_user: int = 100):
        self.queues: Dict[str, List[Dict]] = defaultdict(list)
        self.max_per_user = max_per_user
    
    def enqueue(self, username: str, msg: Dict) -> bool:
        """Add message to queue for offline user"""
        if len(self.queues[username]) >= self.max_per_user:
            return False
        
        self.queues[username].append({
            "message": msg,
            "queued_at": time.time()
        })
        return True
    
    def dequeue(self, username: str) -> List[Dict]:
        """Get all messages for user and clear queue"""
        messages = self.queues.pop(username, [])
        return [m["message"] for m in messages]
    
    def cleanup(self, max_age_seconds: int = 3600):
        """Remove messages older than max_age"""
        now = time.time()
        cleaned = 0
        
        for username in self.queues:
            original_len = len(self.queues[username])
            self.queues[username] = [
                m for m in self.queues[username]
                if now - m["queued_at"] < max_age_seconds
            ]
            cleaned += original_len - len(self.queues[username])
        
        return cleaned
