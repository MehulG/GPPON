import json
import os
import subprocess
import sys
# Sample generalized JSON input
# json_input = """
# {
#     "dataProcess": {
#         "image": "python:3.9",
#         "command": ["python", "app.py"],
#         "cpu": 2,
#         "memory": 4096,
#         "env": {
#             "INPUT_FILE": "data.csv",
#             "OUTPUT_FILE": "results.csv"
#         }
#     }
# }
# """

if len(sys.argv) > 1:
        # If JSON input is provided as a command-line argument
        json_input = sys.argv[1]
else:
    print("Error: JSON input is required as an argument.")
    sys.exit(1)

try:
    config = json.loads(json_input)
    print("Parsed JSON input:", json.dumps(config, indent=4))
except json.JSONDecodeError as e:
    print(f"Invalid JSON input: {e}")
    sys.exit(1)

# Example: Access and print the parsed JSON content
print("Parsed JSON input:", json.dumps(config, indent=4))

# Parse JSON
config = json.loads(json_input)
process_name = list(config.keys())[0]  # Dynamically get the process name
process_config = config[process_name]

# Generate Dockerfile
dockerfile_content = f"""
FROM {process_config['image']}
WORKDIR /app
COPY . /app
"""

# Add environment variables to the Dockerfile
if "env" in process_config:
    for key, value in process_config["env"].items():
        dockerfile_content += f"ENV {key}={value}\n"

# Add the command to the Dockerfile
dockerfile_content += f"CMD {json.dumps(process_config['command'])}\n"

# Write Dockerfile
with open("Dockerfile", "w") as dockerfile:
    dockerfile.write(dockerfile_content)

print("Dockerfile created successfully.")

# Ensure required files exist
for env_file in process_config.get("env", {}).values():
    if not os.path.exists(env_file):
        print(f"Error: Required file '{env_file}' not found.")
        exit(1)

# Build Docker image
image_name = process_name.lower() + "_image"
subprocess.run(["docker", "build", "-t", image_name, "."], check=True)
print(f"Docker image '{image_name}' built successfully.")

# Run Docker container
cpu_limit = str(process_config["cpu"])
memory_limit = f"{process_config['memory']}m"

# Prepare the `docker run` command
run_command = [
    "docker", "run",
    "--name", process_name.lower() + "_container",
    "--rm"
#     "--cpus", cpu_limit,
#     "--memory", memory_limit
]

# Add environment variables as flags
if "env" in process_config:
    for key, value in process_config["env"].items():
        run_command.extend(["-e", f"{key}={value}"])

# Mount current directory
run_command.extend(["-v", os.getcwd() + ":/app"])

# Specify the image name
run_command.append(image_name)

# Execute the container
subprocess.run(run_command, check=True)

print(f"Docker container '{process_name.lower()}_container' ran successfully.")