Feature: CLI integration with local Docker-based server
  As a developer
  I want to verify that the CLI correctly interacts with the local server

  Scenario: CLI fails if --server is passed without query parameters
    When I run mongo-schema-fetch with parameters "--server localhost:3000"
    Then the exit code should be 1
    And the error output should contain "Error: --query or --query-file must be provided when using --server"

  Scenario: CLI fails if --query has invalid JSON formatting
    When I run mongo-schema-fetch with parameters "--server localhost:3000 --query {invalid-json}"
    Then the exit code should be 1
    And the error output should contain "Error: --query must be valid JSON"

  Scenario: CLI connects and successfully uploads to a local server
    Given a running MongoDB "mongo:7.0" container in "standalone" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    And a mock local server is listening on port 4000
    When I run mongo-schema-fetch with parameters "--server localhost:4000 --query '{\"role\":\"admin\"}' --all-collections"
    Then the exit code should be 0
    And the mock local server should have received the payload with collection "users" and query matching "role"
    And the terminal output should contain "Job successfully created! Job ID: mock-job-xyz"
    And the terminal output should contain "View live progress and download report: http://localhost:4000/job/mock-job-xyz"

  Scenario: CLI runs in machine mode and writes logs to default file
    Given a running MongoDB "mongo:7.0" container in "standalone" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    And a mock local server is listening on port 4000
    When I run mongo-schema-fetch with parameters "--server localhost:4000 --query '{\"role\":\"admin\"}' --all-collections --machine"
    Then the exit code should be 0
    And the terminal output should be completely empty
    And the log file "schema-fetch.log" should exist and contain UTC timestamps
    And the output payload "features-payload.json" should exist

  Scenario: CLI runs in machine mode and writes logs to a custom file
    Given a running MongoDB "mongo:7.0" container in "standalone" configuration
    And the database has collection "users" with documents:
      | name  | age | role  |
      | Alice | 30  | admin |
    And a mock local server is listening on port 4000
    When I run mongo-schema-fetch with parameters "--server localhost:4000 --query '{\"role\":\"admin\"}' --all-collections --machine --log-file custom-fetch.log"
    Then the exit code should be 0
    And the terminal output should be completely empty
    And the log file "custom-fetch.log" should exist and contain UTC timestamps
