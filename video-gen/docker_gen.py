import os
import subprocess
import json
import re

# Function to replace placeholders
def replace_placeholders(value, env_dict):
    """Replaces {{var}} placeholders with corresponding env values."""
    if isinstance(value, str):
        return re.sub(r"\{\{(.*?)\}\}", lambda match: env_dict.get(match.group(1), match.group(0)), value)
    return value

def create_dockerfile(payload_json):
    # Parse payload from JSON
    payload =payload_json

    # Initialize Dockerfile lines list
    dockerfile = []

    # Helper function to replace placeholders in a string
    def replace_placeholders(value, env_dict):
        """Replaces {{var}} placeholders with corresponding env values."""
        if isinstance(value, str):
            return re.sub(r"\{\{(.*?)\}\}", lambda match: env_dict.get(match.group(1), match.group(0)), value)
        return value

    # Set base image
    dockerfile.append(f"FROM {payload['image']}")

    # Set environment variables
    for key, value in payload.get("env", {}).items():
        dockerfile.append(f'ENV {key.upper()}="{value}"')

    # Set entrypoint (ensure it's in the correct JSON format)
    entrypoint = json.dumps(payload.get("entrypoint", []))
    dockerfile.append(f'ENTRYPOINT {entrypoint}')

    # Resolve CMD dynamically by replacing placeholders
    env = payload["env"]
    cmd_resolved = [replace_placeholders(part, env) for part in payload["cmd"]]

    # Set CMD (ensure it's in the correct JSON format)
    cmd_resolved_json = json.dumps(cmd_resolved)
    dockerfile.append(f'CMD {cmd_resolved_json}')

    # Convert list to string for final Dockerfile content
    dockerfile_content = "\n".join(dockerfile)

    # Save Dockerfile to file
    with open("Dockerfile", "w") as f:
        f.write(dockerfile_content)

    # Optionally return the generated Dockerfile content
    return dockerfile_content
    print(dockerfile_content)

def run_docker_container(payload):
    """Execute Docker container with comprehensive configuration"""
    run_cmd = [
        'docker', 'run', '--rm',
        # Resource constraints
        *([f'--cpus={payload.get("cpu", 1)}'] if payload.get('cpu') else []),
        *([f'--memory={payload.get("memory", 512)}M'] if payload.get('memory') else []),
        
        # Volume mounts
        '-v', f'{os.getcwd()}:/app',
        '-v', f'{os.getcwd()}:/output',
        
        # Image
        'dynamic_image'
    ]
    
    try:
        result = subprocess.run(run_cmd, capture_output=True, text=True, check=True)
        print("Container executed successfully!")
        print(result.stdout)
    except subprocess.CalledProcessError as e:
        print("Execution Error:")
        print("Return Code:", e.returncode)
        print("STDOUT:", e.stdout)
        print("STDERR:", e.stderr)
        raise

def main(payload):
    """Orchestrate Dockerfile creation, image building, and container running"""
    create_dockerfile(payload)
    subprocess.run(['docker', 'build', '-t', 'dynamic_image', '.'], check=True)
    run_docker_container(payload)

# Example payload
if __name__ == '__main__':
    ffmpeg_payload = {
        "image": "jrottenberg/ffmpeg:latest",
        "cpu": 2,
        "memory": 1024,
        "env": {
            "input": "big_buck_bunny_720p_20mb.mp4",
            "output": "result.mp4",
            "resolution": "100:100"
        },
        "cmd": [
            "-i", "/app/{{input}}", 
            "-vf", "scale={{resolution}}", 
            "-c:a", "copy", 
            "/output/{{output}}"
        ],
        "entrypoint": ["ffmpeg"]
    }
    python_payload = {
        "image": "python:3.9-slim",
        "entrypoint": ["python"],
        "cmd": [
            "-c", 
            "import pandas as pd; print(pd.DataFrame({'col1': [1,2,3]}))"
        ]
    }
    
    main(ffmpeg_payload)
